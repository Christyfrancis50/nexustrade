import { createHash } from 'node:crypto'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB, matches the DB check constraint
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const
export type AllowedMime = (typeof ALLOWED_MIME)[number]

const SIGNATURES: Array<{ mime: AllowedMime; bytes: number[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
]

export class UploadRejected extends Error {
  override name = 'UploadRejected'
}

/** Detect the real type from the file's first bytes. Never trust the extension or browser MIME. */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  for (const sig of SIGNATURES) if (sig.bytes.every((b, i) => bytes[i] === b)) return sig.mime
  return null
}

export type CheckedFile = { bytes: Uint8Array; mimeType: AllowedMime; sizeBytes: number; sha256: string; filename: string }

export function checkUpload(bytes: Uint8Array, filename: string): CheckedFile {
  if (bytes.byteLength === 0) throw new UploadRejected('The file is empty.')
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadRejected('Files must be 10 MB or smaller.')
  const mimeType = sniffMime(bytes)
  if (!mimeType) throw new UploadRejected('Only PDF, PNG and JPEG files are accepted.')
  return {
    bytes,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    filename: safeFilename(filename),
  }
}

/** Keep a readable name for display; strip paths and anything odd. Storage keys never use it. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'document'
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleaned || 'document'
}

export const EXTENSION: Record<AllowedMime, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }
