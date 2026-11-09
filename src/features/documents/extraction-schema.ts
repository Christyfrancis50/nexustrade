import { z } from 'zod'

/** Accept a number or numeric string from the model; normalise to a plain decimal string. */
const decimal = (dp: number) =>
  z
    .union([z.number().nonnegative(), z.string()])
    .transform((v) => (typeof v === 'number' ? String(v) : v.replace(/[,\s]/g, '')))
    .pipe(z.string().regex(new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`), `Expected a non-negative number with at most ${dp} decimals`))

const locode = z
  .string()
  .transform((s) => s.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{5}$/, 'Expected a 5-letter UN/LOCODE, e.g. AEJEA'))

const party = z.object({
  name: z.string().min(1).describe('Company name as printed'),
  trn: z.string().nullable().describe('Tax registration number exactly as printed, or null if absent'),
})

/**
 * What the model must return for any trade document. Kept deliberately small and
 * explicit; every value is re-validated and the maths re-done by reconcile().
 */
export const extractedDocumentSchema = z.object({
  documentType: z.enum(['BILL_OF_LADING', 'AIRWAY_BILL', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'PROOF_OF_DELIVERY']),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable().describe('ISO date YYYY-MM-DD if present'),
  shipper: party,
  consignee: party,
  originPort: locode.nullable(),
  destinationPort: locode.nullable(),
  currency: z.enum(['AED', 'USD', 'EUR', 'GBP']).nullable(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: decimal(3),
        unit: z.string().min(1).describe('e.g. PCS, KG, CTN, BAG'),
        unitPrice: decimal(2).nullable().describe('Price per unit; null on documents without prices'),
        weightKg: decimal(3).nullable(),
        volumeCbm: decimal(3).nullable(),
      }),
    )
    .max(200),
  statedSubtotal: decimal(2).nullable(),
  statedVat: decimal(2).nullable(),
  statedTotal: decimal(2).nullable(),
})

/**
 * The plain JSON shape sent to the model (no transforms, so it converts cleanly
 * to JSON Schema). Its output is then normalised by `extractedDocumentSchema`.
 */
const num = () => z.string().nullable().describe('Number as printed, digits and "." only, e.g. "1234.50"; null if absent')
export const modelOutputSchema = z.object({
  documentType: z.enum(['BILL_OF_LADING', 'AIRWAY_BILL', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'PROOF_OF_DELIVERY']),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable().describe('ISO date YYYY-MM-DD if present'),
  shipper: z.object({ name: z.string(), trn: z.string().nullable() }),
  consignee: z.object({ name: z.string(), trn: z.string().nullable() }),
  originPort: z.string().nullable().describe('5-letter UN/LOCODE'),
  destinationPort: z.string().nullable().describe('5-letter UN/LOCODE'),
  currency: z.enum(['AED', 'USD', 'EUR', 'GBP']).nullable(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.string().describe('Quantity as printed'),
      unit: z.string(),
      unitPrice: num(),
      weightKg: num(),
      volumeCbm: num(),
    }),
  ),
  statedSubtotal: num(),
  statedVat: num(),
  statedTotal: num(),
})

export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>
/** The schema's input shape: what providers (and the model) return before normalisation. */
export type RawExtraction = z.input<typeof extractedDocumentSchema>

export const EXTRACTION_PROMPT = `You are a meticulous trade-document clerk for UAE customs.
Extract the fields from the attached document exactly as printed. Do not guess or invent values:
use null when a field is absent or unreadable. Copy numbers without currency symbols.
Ports must be UN/LOCODEs (for example Jebel Ali = AEJEA, Shanghai = CNSHA); use null if you cannot map one with confidence.
List every line item in order. Do not compute totals yourself: report the subtotal, VAT and total exactly as printed.`
