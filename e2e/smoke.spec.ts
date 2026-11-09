import { expect, test } from '@playwright/test'

test('home page renders and sends security headers', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NexusTrade')

  const headers = res!.headers()
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-powered-by']).toBeUndefined()
})
