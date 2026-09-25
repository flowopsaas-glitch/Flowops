import { test, expect } from '@playwright/test';

test.describe('Route Guards', () => {
  test('unauthenticated user redirected to login', async ({ page }) => {
    // Clear any existing tokens
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });

  test('/owner redirects without owner token', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/owner');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });

  test('login page is publicly accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);
  });
});
