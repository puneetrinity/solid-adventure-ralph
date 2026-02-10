import { test, expect } from '@playwright/test';

const bypassToken = process.env.E2E_AUTH_BYPASS_TOKEN;

test.beforeEach(async ({ page }) => {
  if (bypassToken) {
    // Use route interception to add headers to ALL requests including navigation
    await page.route('**/*', async (route) => {
      const headers = {
        ...route.request().headers(),
        'x-auth-bypass': bypassToken,
        'x-test-user': 'e2e',
      };
      await route.continue({ headers });
    });
  }
});

test.skip(!process.env.E2E_BASE_URL, 'E2E_BASE_URL not set');

test('repositories page loads', async ({ page }) => {
  await page.goto('/repos', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Repositories' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /add repository/i })).toBeVisible();
});
