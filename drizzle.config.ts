import { defineConfig } from 'drizzle-kit'

// Load .env if present (Node 22 built-in; no dotenv needed).
try {
  process.loadEnvFile()
} catch {
  /* no .env file: fine in CI */
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
