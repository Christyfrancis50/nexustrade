import 'server-only'
import { env } from '@/env'
import { googleEmbedder, type Embedder } from './embedder'

let cached: Promise<Embedder | null> | undefined

/** Semantic search when configured; null means keyword search (no key needed). */
export function getEmbedder(): Promise<Embedder | null> {
  cached ??=
    env.EMBEDDING_PROVIDER === 'google' && env.GOOGLE_GENERATIVE_AI_API_KEY
      ? googleEmbedder(env.GOOGLE_GENERATIVE_AI_API_KEY)
      : Promise.resolve(null)
  return cached
}
