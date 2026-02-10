import { test, expect } from '@playwright/test';

const bypassToken = process.env.E2E_AUTH_BYPASS_TOKEN;

test.beforeEach(async ({ page }) => {
  if (bypassToken) {
    await page.setExtraHTTPHeaders({
      'x-auth-bypass': bypassToken,
      'x-test-user': 'e2e',
    });
  }
});

test.skip(!process.env.E2E_BASE_URL, 'E2E_BASE_URL not set');

test('repositories page loads', async ({ page }) => {
  await page.goto('/repos', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Repositories' })).toBeVisible();
  await expect(page.getByRole('button', { name: /add repository/i })).toBeVisible();
});
