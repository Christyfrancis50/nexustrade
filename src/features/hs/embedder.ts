import { createHash } from 'node:crypto'
import { embedMany } from 'ai'
import { HS_EMBEDDING_DIMENSIONS } from '@/db/schema/customs'

export type EmbedPurpose = 'document' | 'query'

export interface Embedder {
  readonly name: string
  embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]>
}

/** Google gemini-embedding-001 (free tier), truncated to 384 dimensions. */
export async function googleEmbedder(apiKey: string, opts: { maxRetries?: number } = {}): Promise<Embedder> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
  const model = createGoogleGenerativeAI({ apiKey }).embeddingModel('gemini-embedding-001')
  return {
    name: 'google:gemini-embedding-001@384',
    async embed(texts, purpose) {
      const { embeddings } = await embedMany({
        model,
        values: texts,
        maxRetries: opts.maxRetries ?? 3,
        providerOptions: {
          google: { outputDimensionality: HS_EMBEDDING_DIMENSIONS, taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' },
        },
      })
      return embeddings.map(normalise)
    },
  }
}

/**
 * Deterministic bag-of-words hashing embedder: no model, no network. Used in
 * tests to exercise the pgvector path; it only matches shared words.
 */
export function hashEmbedder(): Embedder {
  return {
    name: 'hash@384',
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array<number>(HS_EMBEDDING_DIMENSIONS).fill(0)
        for (const w of keywords(t)) {
          const h = createHash('md5').update(w).digest()
          v[h.readUInt16BE(0) % HS_EMBEDDING_DIMENSIONS]! += h[2]! % 2 ? 1 : -1
        }
        return normalise(v)
      })
    },
  }
}

function normalise(v: number[]): number[] {
  const n = Math.hypot(...v)
  return n === 0 ? v : v.map((x) => x / n)
}

const STOP = new Set(['the', 'and', 'for', 'with', 'other', 'not', 'than', 'whether', 'or', 'of', 'in', 'kind', 'used', 'nec', 'n.e.c'])

/** Lower-case keywords (3+ letters, no stop words), de-duplicated and capped. */
export function keywords(text: string, max = 16): string[] {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? []
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, max)
}
