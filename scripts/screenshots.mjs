// Captures README screenshots of the public pages from a running production server.
// Usage: npm run build && npm start -- --port 3300 (then) node scripts/screenshots.mjs
import { chromium } from '@playwright/test'
const base = process.env.BASE_URL ?? 'http://localhost:3300'
const browser = await chromium.launch()
for (const [name, path, scheme] of [['home', '/', 'light'], ['home-dark', '/', 'dark'], ['login', '/login', 'light']]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme })
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `docs/screenshots/${name}.png` })
  await page.close()
}
await browser.close()
console.log('Saved docs/screenshots/*.png')
