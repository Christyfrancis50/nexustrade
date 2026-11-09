import 'server-only'
import { env } from '@/env'
import { aiProvider, mockProvider, type ExtractionProvider } from './providers'

/** Free-tier friendly defaults; override with AI_MODEL. */
const DEFAULT_MODEL = { google: 'gemini-3.8-flash', anthropic: 'claude-sonnet-5-5' } as const

export async function getExtractionProvider(): Promise<ExtractionProvider> {
  switch (env.AI_PROVIDER) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
      const id = env.AI_MODEL ?? DEFAULT_MODEL.google
      return aiProvider(`google:${id}`, google(id))
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
      const id = env.AI_MODEL ?? DEFAULT_MODEL.anthropic
      return aiProvider(`anthropic:${id}`, anthropic(id))
    }
    default:
      return mockProvider
  }
}
