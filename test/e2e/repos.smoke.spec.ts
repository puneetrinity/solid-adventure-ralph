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

  // Debug: log page content if heading not found
  const heading = page.getByRole('heading', { name: 'Repositories' });
  const isVisible = await heading.isVisible().catch(() => false);
  if (!isVisible) {
    const bodyText = await page.locator('body').textContent();
    console.log('Page content:', bodyText?.substring(0, 500));
    const url = page.url();
    console.log('Current URL:', url);
  }

  await expect(heading).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /add repository/i })).toBeVisible();
});
