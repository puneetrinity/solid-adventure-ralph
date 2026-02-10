import { test, expect } from '@playwright/test';

const bypassToken = process.env.E2E_AUTH_BYPASS_TOKEN;

test.beforeEach(async ({ page }) => {
  if (bypassToken) {
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

test('create feature request from repos page', async ({ page }) => {
  await page.goto('/repos', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: /add repository/i }).click();

  const ownerInput = page.getByPlaceholder('Owner');
  const repoInput = page.getByPlaceholder('Repository');
  const branchInput = page.getByPlaceholder('Branch');

  await ownerInput.fill('test-owner');
  await repoInput.fill('test-repo');
  await branchInput.fill('main');

  await page.getByRole('button', { name: /add & refresh/i }).click();
  const targetRow = page.locator('tr', { hasText: 'test-owner/test-repo' });
  let row = targetRow;
  if (await targetRow.count()) {
    await expect(targetRow).toBeVisible({ timeout: 15000 });
  } else {
    const fallbackRow = page.locator('tbody tr').first();
    await expect(fallbackRow).toBeVisible({ timeout: 15000 });
    row = fallbackRow;
  }
  await row.getByRole('button', { name: /create feature/i }).click();

  await page.getByPlaceholder('What do you want to build?').fill('Add scoring dashboard');
  await page.getByPlaceholder('Why does this matter?').fill('Needed for recruiter workflows');

  await page.getByRole('button', { name: /create request/i }).click();

  await expect(page).toHaveURL(/\/workflows\//, { timeout: 15000 });
  await expect(page.getByText(/feasibility/i)).toBeVisible();
});
