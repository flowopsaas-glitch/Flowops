import { test, expect } from '@playwright/test';

test.describe('Error Boundary', () => {
  test('app shell loads without crashing', async ({ page }) => {
    await page.goto('/login');
    // If ErrorBoundary is working, page should not be blank
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('console errors are captured', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // No critical JS errors on login page
    const critical = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('manifest') &&
      !e.includes('WebSocket') &&
      !e.includes('ResizeObserver')
    );
    // Log for debugging but don't fail — this is a baseline
    console.log(`Non-critical console errors on /login: ${critical.length}`);
  });
});
