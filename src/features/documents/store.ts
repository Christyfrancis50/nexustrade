import type { SupabaseClient } from '@supabase/supabase-js'
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from './file-check'

export const DOCUMENTS_BUCKET = 'trade-documents'
export const SIGNED_URL_SECONDS = 300

/** Where uploaded files live. Keys are server-generated, never user-supplied. */
export interface DocumentStore {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>
  signedUrl(key: string): Promise<string | null>
}

/** Supabase Storage, private bucket. Uses the service-role client: server only. */
export function supabaseStore(admin: SupabaseClient): DocumentStore {
  let ensured = false
  async function ensureBucket() {
    if (ensured) return
    const { data } = await admin.storage.getBucket(DOCUMENTS_BUCKET)
    if (!data) {
      const { error } = await admin.storage.createBucket(DOCUMENTS_BUCKET, {
        public: false,
        fileSizeLimit: MAX_UPLOAD_BYTES,
        allowedMimeTypes: [...ALLOWED_MIME],
      })
      if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create storage bucket: ${error.message}`)
    }
    ensured = true
  }
  return {
    async put(key, bytes, mimeType) {
      await ensureBucket()
      const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(key, bytes, { contentType: mimeType, upsert: true })
      if (error) throw new Error(`Upload failed: ${error.message}`)
    },
    async signedUrl(key) {
      if (key.startsWith('seed/')) return null // demo rows have no real file
      const { data } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(key, SIGNED_URL_SECONDS)
      return data?.signedUrl ?? null
    },
  }
}

/** In-memory store for tests. */
export function memoryStore(): DocumentStore & { files: Map<string, { bytes: Uint8Array; mimeType: string }> } {
  const files = new Map<string, { bytes: Uint8Array; mimeType: string }>()
  return {
    files,
    async put(key, bytes, mimeType) {
      files.set(key, { bytes, mimeType })
    },
    async signedUrl(key) {
      return files.has(key) ? `memory://${key}` : null
    },
  }
}
