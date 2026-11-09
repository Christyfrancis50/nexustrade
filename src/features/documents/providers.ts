import { generateText, Output, type LanguageModel } from 'ai'
import type { CheckedFile } from './file-check'
import { EXTRACTION_PROMPT, modelOutputSchema, type RawExtraction } from './extraction-schema'

export type DocumentKind = RawExtraction['documentType']

/** Anything that turns a file into raw extraction output. Its result is always re-validated. */
export interface ExtractionProvider {
  readonly name: string
  extract(file: CheckedFile, hint: { documentType: DocumentKind }): Promise<unknown>
}

/**
 * Deterministic stand-in used when no AI key is configured (local dev, CI, demos).
 * Put "mismatch" in a filename to get an invoice whose stated total is wrong,
 * which exercises the discrepancy flow end to end.
 */
export const mockProvider: ExtractionProvider = {
  name: 'mock',
  async extract(file, { documentType }) {
    const priced = documentType === 'COMMERCIAL_INVOICE'
    const lines = [
      { description: 'Industrial hydraulic pump valve seals, nitrile rubber', quantity: '2000', unit: 'PCS', unitPrice: '1.85', weightKg: '120', volumeCbm: '0.8' },
      { description: 'Gear pump assembly, cast iron, 40 L/min', quantity: '40', unit: 'PCS', unitPrice: '310.00', weightKg: '920', volumeCbm: '2.4' },
      { description: 'Stainless steel ball valves, 2 inch', quantity: '150', unit: 'PCS', unitPrice: '42.50', weightKg: '450', volumeCbm: '0.9' },
    ]
    const subtotal = '22475.00' // 3700 + 12400 + 6375
    const wrong = /mismatch/i.test(file.filename)
    const result: RawExtraction = {
      documentType,
      documentNumber: `${documentType === 'COMMERCIAL_INVOICE' ? 'CI' : documentType === 'AIRWAY_BILL' ? 'AWB' : 'DOC'}-${file.sha256.slice(0, 6).toUpperCase()}`,
      documentDate: '2026-10-28',
      shipper: { name: 'Ningbo Hydraulic Components Co.', trn: null },
      consignee: { name: 'Gulf Industrial Supplies LLC', trn: '100234567800003' },
      originPort: 'CNNGB',
      destinationPort: 'AEJEA',
      currency: priced ? 'USD' : null,
      lineItems: lines.map((l) => ({ ...l, unitPrice: priced ? l.unitPrice : null })),
      statedSubtotal: priced ? (wrong ? '23925.00' : subtotal) : null,
      statedVat: null,
      statedTotal: priced ? (wrong ? '23925.00' : subtotal) : null,
    }
    return result
  },
}

/** Vision-model extraction through the Vercel AI SDK, constrained to a JSON schema. */
export function aiProvider(name: string, model: LanguageModel): ExtractionProvider {
  return {
    name,
    async extract(file, { documentType }) {
      const { output } = await generateText({
        model,
        temperature: 0,
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(60_000),
        output: Output.object({ schema: modelOutputSchema }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${EXTRACTION_PROMPT}\nThe uploader says this is a ${documentType.replaceAll('_', ' ').toLowerCase()}.` },
              { type: 'file', data: file.bytes, mediaType: file.mimeType },
            ],
          },
        ],
      })
      return output
    },
  }
}
