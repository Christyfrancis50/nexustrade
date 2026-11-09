import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../test/pglite'
import * as schema from '@/db/schema'
import HS_DATASET from '@/db/data/hs-codes.json'
import { indicativeDuty } from '@/db/data/hs-rules'
import { suggestForPendingLines, suggestHsCodes } from './classify'
import { hashEmbedder, keywords } from './embedder'
import { clearanceCheck, clearShipment, CustomsError, decideLine, holdShipment } from './review'

let t: TestDb
let shipmentId: string

async function addLine(description: string, lineNo: number) {
  const [l] = await t.db
    .insert(schema.lineItems)
    .values({ shipmentId, lineNo, description, quantity: '10', unit: 'PCS', unitPrice: '100.00', currency: 'USD' })
    .returning()
  return l!
}

beforeAll(async () => {
  t = await createTestDb()
  for (let i = 0; i < HS_DATASET.length; i += 1000)
    await t.db.insert(schema.hsCodes).values(HS_DATASET.slice(i, i + 1000).map((h) => ({ ...h, chapter: Number(h.code.slice(0, 2)) })))
  const [s] = await t.db
    .insert(schema.shipments)
    .values({ trackingNumber: 'HS-1', mode: 'SEA', status: 'IN_TRANSIT', shipperName: 'A', consigneeName: 'B', carrierName: 'C', originPort: 'CNNGB', destinationPort: 'AEJEA', freightAmount: '1000.00' })
    .returning()
  shipmentId = s!.id
}, 120_000)

describe('dataset and duty rules', () => {
  it('has every official 6-digit subheading with context', () => {
    expect(HS_DATASET.length).toBeGreaterThan(5000)
    expect(HS_DATASET.every((h) => /^\d{6}$/.test(h.code) && h.description && h.heading)).toBe(true)
  })

  it('applies indicative duty and control rules', () => {
    expect(indicativeDuty('100630')).toEqual({ dutyRateBp: 0, restricted: false }) // rice
    expect(indicativeDuty('240220')).toEqual({ dutyRateBp: 10000, restricted: true }) // cigarettes
    expect(indicativeDuty('220300')).toEqual({ dutyRateBp: 5000, restricted: true }) // beer
    expect(indicativeDuty('930320').restricted).toBe(true) // shotguns
    expect(indicativeDuty('841360')).toEqual({ dutyRateBp: 500, restricted: false }) // pumps
  })
})

describe('keyword classification (no AI key)', () => {
  it.each([
    ['Gear pump assembly, rotary, for hydraulic liquids', '8413'],
    ['Nitrile rubber gaskets and seals for valves', '4016'],
    ['Smartphones for cellular networks, 128 GB', '851713'],
    ['Cigarettes containing tobacco, 20 per pack', '240220'],
  ])('"%s" → %s', async (description, expected) => {
    const [top] = await suggestHsCodes(t.db, description)
    expect(top?.code.startsWith(expected)).toBe(true)
    expect(top?.method).toBe('keyword')
    expect(top!.confidence).toBeGreaterThan(0)
  })

  it('keeps close alternatives in the top 3 (PV modules vs loose cells)', async () => {
    const codes = (await suggestHsCodes(t.db, 'Photovoltaic solar panels assembled in modules')).map((s) => s.code)
    expect(codes).toContain('854143')
  })

  it('returns nothing for text with no usable keywords', async () => {
    expect(await suggestHsCodes(t.db, '12 x 34 --')).toEqual([])
  })

  it('extracts keywords without stop words', () => {
    expect(keywords('Pumps for liquids, other than of the kind used')).toEqual(['pumps', 'liquids'])
  })
})

describe('semantic classification (pgvector)', () => {
  it('ranks by cosine similarity once embeddings exist', async () => {
    const embedder = hashEmbedder()
    const sample = HS_DATASET.filter((h) => ['841360', '851713', '100630', '401693'].includes(h.code))
    const vectors = await embedder.embed(sample.map((h) => `${h.heading}. ${h.description}`), 'document')
    for (const [i, h] of sample.entries()) await t.db.update(schema.hsCodes).set({ embedding: vectors[i]! }).where(eq(schema.hsCodes.code, h.code))

    const [top] = await suggestHsCodes(t.db, 'Telephone sets; smartphones for cellular networks', { embedder })
    expect(top).toMatchObject({ code: '851713', method: 'semantic' })
    expect(top!.confidence).toBeGreaterThan(0.3) // hash embedder: shared words only
  })
})

describe('broker review', () => {
  it('auto-suggests a code for unclassified lines', async () => {
    const line = await addLine('Rotary gear pumps for hydraulic oil', 1)
    expect(await suggestForPendingLines(t.db, { shipmentId })).toBe(1)
    const [after] = await t.db.select().from(schema.lineItems).where(eq(schema.lineItems.id, line.id))
    expect(after).toMatchObject({ hsStatus: 'SUGGESTED' })
    expect(after!.hsCode).toMatch(/^\d{6}$/)
    expect(Number(after!.hsConfidence)).toBeGreaterThan(0)
  })

  it('approving the suggestion records an APPROVED decision', async () => {
    const [line] = await t.db.select().from(schema.lineItems).where(eq(schema.lineItems.lineNo, 1))
    const r = await decideLine(t.db, { lineItemId: line!.id, chosenCode: line!.hsCode!, brokerId: null })
    expect(r).toEqual({ decision: 'APPROVED', restricted: false })
    expect(await t.db.$count(schema.classificationDecisions)).toBe(1)
  })

  it('an override needs a note and an existing code', async () => {
    const line = await addLine('Assorted hand tools', 2)
    await suggestForPendingLines(t.db, { shipmentId })
    await expect(decideLine(t.db, { lineItemId: line.id, chosenCode: '999999', brokerId: null, note: 'x' })).rejects.toThrow(/not in the tariff/)
    await expect(decideLine(t.db, { lineItemId: line.id, chosenCode: '820411', brokerId: null })).rejects.toThrow(/note/)
    const r = await decideLine(t.db, { lineItemId: line.id, chosenCode: '820411', brokerId: null, note: 'Actually spanners, heading 8204' })
    expect(r.decision).toBe('OVERRIDDEN')
  })

  it('shipment can be cleared once every line is decided', async () => {
    expect(await clearanceCheck(t.db, shipmentId)).toEqual({ ready: true, blockers: [] })
  })

  it('restricted goods put the shipment on hold and block clearance', async () => {
    const line = await addLine('Cigarettes containing tobacco', 3)
    await suggestForPendingLines(t.db, { shipmentId })
    const r = await decideLine(t.db, { lineItemId: line.id, chosenCode: '240220', brokerId: null })
    expect(r.restricted).toBe(true)
    const [s] = await t.db.select().from(schema.shipments).where(eq(schema.shipments.id, shipmentId))
    expect(s!.status).toBe('CUSTOMS_HOLD')
    const check = await clearanceCheck(t.db, shipmentId)
    expect(check.ready).toBe(false)
    expect(check.blockers.join(' ')).toMatch(/restricted line/)
    await expect(clearShipment(t.db, { shipmentId, brokerId: null })).rejects.toBeInstanceOf(CustomsError)
  })

  it('clears a shipment when nothing blocks it, and logs it', async () => {
    const [s2] = await t.db
      .insert(schema.shipments)
      .values({ trackingNumber: 'HS-2', mode: 'AIR', status: 'IN_TRANSIT', shipperName: 'A', consigneeName: 'B', carrierName: 'C', originPort: 'GBLHR', destinationPort: 'AEDWC', freightAmount: '500.00' })
      .returning()
    const [l] = await t.db.insert(schema.lineItems).values({ shipmentId: s2!.id, lineNo: 1, description: 'Laptops', quantity: '5', unit: 'PCS', unitPrice: '600.00', currency: 'GBP' }).returning()
    await decideLine(t.db, { lineItemId: l!.id, chosenCode: '847130', brokerId: null })
    await clearShipment(t.db, { shipmentId: s2!.id, brokerId: null })
    const [after] = await t.db.select().from(schema.shipments).where(eq(schema.shipments.id, s2!.id))
    expect(after!.status).toBe('CLEARED')
    await expect(decideLine(t.db, { lineItemId: l!.id, chosenCode: '847130', brokerId: null })).rejects.toThrow(/in transit or on customs hold/)
  })

  it('holds need a reason and only apply to shipments in transit', async () => {
    await expect(holdShipment(t.db, { shipmentId, brokerId: null, reason: ' ' })).rejects.toThrow(/reason/)
    await expect(holdShipment(t.db, { shipmentId, brokerId: null, reason: 'Inspection' })).rejects.toThrow(/in transit/)
  })
})
