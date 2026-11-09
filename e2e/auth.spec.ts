import { expect, test } from '@playwright/test'

// These run without Supabase keys (CI, fresh clones): they cover the guard rails.
// Signed-in flows are covered once a test project's keys are available.

test('signed-out visitors are sent from a workspace to sign-in, keeping the destination', async ({ page }) => {
  await page.goto('/workspace/finance')
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace%2Ffinance$/)
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()
})

test('every workspace route is protected', async ({ page }) => {
  for (const path of ['/workspace', '/workspace/coordinator', '/workspace/broker']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('sign-in form validates input before calling the server', async ({ page }) => {
  await page.goto('/login')
  const configured = await page.getByRole('button', { name: 'Sign in' }).isEnabled()
  test.skip(!configured, 'Supabase keys not set: the form is disabled by design')
  await page.getByLabel('Work email').fill('not-an-email')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
})

test('home page links to sign-in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in to your workspace' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
