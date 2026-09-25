import { test, expect } from '@playwright/test';

test.describe('Onboarding', () => {
  test('setup page loads with form fields', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByText(/Register/i)).toBeVisible();
    await expect(page.getByPlaceholder('Acme Logistics', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/admin@/i)).toBeVisible();
    await expect(page.getByPlaceholder(/\+27/i)).toBeVisible();
  });

  test('setup validates required fields', async ({ page }) => {
    await page.goto('/setup');
    const submit = page.getByRole('button', { name: /submit/i });
    await submit.click();
    // Should show error or not navigate
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/setup/);
  });

  test('setup → status flow', async ({ page }) => {
    await page.goto('/setup');
    // Fill form
    await page.getByPlaceholder('Acme Logistics', { exact: true }).fill('Test Company');
    await page.getByPlaceholder(/admin@/i).fill('test@example.com');
    await page.getByPlaceholder(/\+27/i).fill('+27821234567');
    await page.getByRole('button', { name: /submit/i }).click();
    // Should navigate to status
    await expect(page).toHaveURL(/status/, { timeout: 5000 });
    await expect(page.getByText(/Pending/i)).toBeVisible();
  });

  test('status page without application', async ({ page }) => {
    // Clear any existing data
    await page.goto('/status');
    // If no company info, should show "No Application"
    const noApp = page.getByText(/No Application/i);
    const pending = page.getByText(/Pending/i);
    // One of these should be visible
    await expect(noApp.or(pending)).toBeVisible();
  });
});
