import { test, expect } from '@playwright/test';

/**
 * Department guard sweep: every department's front door must refuse an
 * unauthenticated visitor (redirect to /login) — no department page may
 * render its shell on stored-state alone. Public counterparty surfaces
 * must fail honestly (an invalid share link says so, never spins forever).
 */
const PROTECTED_ROUTES = [
  // Core ops
  '/dashboard', '/shipments', '/waybills', '/waybills/inbox', '/clients',
  '/dispatch', '/operations', '/manifests', '/collections', '/returns',
  // Warehouse
  '/warehouse', '/wms', '/wms/slotting', '/wms/waves', '/process-book', '/product-master',
  // Rail & forwarding
  '/rail', '/forwarding',
  // Finance & billing
  '/finance', '/invoices', '/accounting', '/billing/plans', '/cod', '/quotes',
  // Communications & support
  '/whatsapp', '/email', '/support', '/customer-service',
  // Insights & AI
  '/logistics-analytics', '/commercial-analytics', '/ask', '/autopilot',
  // Fleet & drivers
  '/drivers', '/fleet', '/live-tracking',
  // Admin & settings
  '/settings', '/settings/roles', '/admin/approvals', '/user-roles',
] as const;

test.describe('Department route guards (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  for (const path of PROTECTED_ROUTES) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
    });
  }
});

test.describe('Public counterparty surfaces', () => {
  test('an invalid gate share link fails honestly, not silently', async ({ page }) => {
    // CI starts only Vite for this browser suite, not the API. Exercise the
    // frontend against the actual 404 contract rather than guessing whether a
    // connection failure means a token is invalid. The service's own unit test
    // separately checks that it returns this error for an unknown token.
    let requests = 0;
    await page.route('**/api/v1/rail/truck-appointments/public/definitely-not-a-real-token', async (route) => {
      const headers = {
        'access-control-allow-origin': route.request().headers().origin ?? 'http://localhost:5173',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      expect(route.request().method()).toBe('GET');
      requests++;
      await route.fulfill({
        status: 404,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 404, message: 'Shared appointment not found or the link was revoked', error: 'Not Found' }),
      });
    });
    await page.goto('/gate/definitely-not-a-real-token');
    await expect(page.getByText('Shared appointment not found or the link was revoked')).toBeVisible({ timeout: 15000 });
    expect(requests).toBeGreaterThan(0);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('marketing pages render without a login wall', async ({ page }) => {
    for (const path of ['/features', '/pricing']) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});
