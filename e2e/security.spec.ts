import { expect, test } from '@playwright/test'

// These run against the production build with no secrets configured (as in CI).

test.describe('content security policy', () => {
  for (const path of ['/', '/login', '/forbidden']) {
    test(`${path} loads with a strict CSP and no violations`, async ({ page }) => {
      const violations: string[] = []
      page.on('console', (m) => {
        if (/Content Security Policy|Refused to (execute|load|apply)/i.test(m.text())) violations.push(m.text())
      })
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load (CSP): ${e.violatedDirective} ${e.blockedURI}`))
      })
      const res = await page.goto(path)
      const csp = res!.headers()['content-security-policy'] ?? ''
      // No third-party script origins and no eval in production.
      expect(csp).toMatch(/script-src 'self' 'unsafe-inline'(;|$)/)
      expect(csp).not.toContain('unsafe-eval')
      for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "default-src 'self'"]) expect(csp).toContain(d)
      await page.waitForLoadState('networkidle')
      expect(violations).toEqual([])
    })
  }

  test('the app hydrates (client-side navigation works under the CSP)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const hydrated = await page.evaluate(() => typeof (window as unknown as { next?: unknown }).next !== 'undefined')
    expect(hydrated).toBe(true)
  })
})

test.describe('API guards (signed out)', () => {
  test('exports require sign-in', async ({ request }) => {
    for (const kind of ['journal', 'xero', 'vat']) expect((await request.get(`/api/exports/${kind}`)).status()).toBe(401)
  })

  test('document files require sign-in', async ({ request }) => {
    expect((await request.get('/api/documents/00000000-0000-0000-0000-000000000000/file')).status()).toBe(401)
  })

  test('the Stripe webhook refuses unsigned or unconfigured calls', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', { data: { type: 'checkout.session.completed' } })
    expect([400, 503]).toContain(res.status())
  })

  test('health check is public and reveals nothing', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  test('unknown pages return a branded 404', async ({ page }) => {
    const res = await page.goto('/definitely-not-a-page')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/not found/i)
  })
})
