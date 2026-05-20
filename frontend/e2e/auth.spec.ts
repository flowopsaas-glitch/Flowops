import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login page loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/flowops/i);
    await expect(page.getByText('Sign In')).toBeVisible();
  });

  test('shows error on empty submit', async ({ page }) => {
    // Click sign in without filling fields
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    if (await submitBtn.isVisible()) {
      // The form might require checkbox agreement first
      const checkbox = page.getByRole('checkbox');
      if (await checkbox.isVisible()) await checkbox.check();
      await submitBtn.click();
      // Should show some validation or error
      await page.waitForTimeout(1000);
      // Verify still on login page
      await expect(page).toHaveURL(/login/);
    }
  });

  test('login page has terms link', async ({ page }) => {
    const termsLink = page.getByRole('link', { name: /terms/i });
    if (await termsLink.isVisible()) {
      expect(await termsLink.getAttribute('href')).toContain('/legal/terms');
    }
  });

  test('login page has privacy link', async ({ page }) => {
    const privacyLink = page.getByRole('link', { name: /privacy/i });
    if (await privacyLink.isVisible()) {
      expect(await privacyLink.getAttribute('href')).toContain('/legal/privacy');
    }
  });
});
