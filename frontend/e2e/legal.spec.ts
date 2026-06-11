import { test, expect } from '@playwright/test';

test.describe('Legal Pages', () => {
  test('terms page loads and has content', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByText(/Terms of Service/i)).toBeVisible();
    // Should have at least some sections
    const sections = page.locator('section, article');
    await expect(sections.first()).toBeVisible();
    // Back to login link
    const backLink = page.getByRole('link', { name: /back/i });
    if (await backLink.isVisible()) {
      expect(await backLink.getAttribute('href')).toContain('/login');
    }
  });

  test('privacy page loads and has content', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByText(/Privacy/i)).toBeVisible();
    // Should link to terms
    const termsLink = page.getByRole('link', { name: /terms/i });
    if (await termsLink.isVisible()) {
      expect(await termsLink.getAttribute('href')).toContain('/legal/terms');
    }
  });

  test('terms → privacy navigation works', async ({ page }) => {
    await page.goto('/legal/terms');
    const privacyLink = page.getByRole('link', { name: /privacy/i });
    if (await privacyLink.isVisible()) {
      await privacyLink.click();
      await expect(page).toHaveURL(/legal\/privacy/);
    }
  });
});
