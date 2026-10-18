import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/rail", pageHeading: "Rail & Intermodal Operations", navLabel: "Rail Ops Console" },
  { path: "/rail/timetable", pageHeading: "Rail Timetable", navLabel: "Timetable Explorer" },
  { path: "/rail/kpis", pageHeading: "Corridor KPIs", navLabel: "Corridor KPIs" },
  { path: "/rail/slots", pageHeading: "Slots & capacity", navLabel: "Slots & Capacity" },
  { path: "/rail/tariffs", pageHeading: "Tariffs & charges", navLabel: "Tariffs & Charges" },
  { path: "/rail/statement", pageHeading: "Network statement", navLabel: "Network Statement" },
  { path: "/rail/register", pageHeading: "Network register", navLabel: "Network Register" },
  { path: "/rail/investment", pageHeading: "Investment plan", navLabel: "Investment Plan" },
  { path: "/rail/occurrence", pageHeading: "Occurrence & policy", navLabel: "Occurrence & Policy" },
  { path: "/rail/cancellations", pageHeading: "Cancellations", navLabel: "Cancellations" },
  { path: "/rail/access", pageHeading: "Access & disputes", navLabel: "Access & Disputes" },
  { path: "/rail/handshake", pageHeading: "Daily Handshake", navLabel: "Daily Handshake" },
  { path: "/rail/sources", pageHeading: "Network Sources", navLabel: "Network Sources" },
] as const;

async function installAuthenticatedApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("flowops.access_token", "rail-route-test-token");
    localStorage.setItem("flowops.login_mode", "tenant");
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    let payload: unknown = {};

    if (pathname === "/auth/me") {
      payload = {
        id: "rail-route-test-user",
        email: "rail-route-test@example.invalid",
        name: "Rail route test",
        role: "ADMIN",
        companyId: "rail-route-test-tenant",
      };
    } else if (pathname === "/companies/my-company") {
      payload = {
        id: "rail-route-test-tenant",
        name: "Rail route test tenant",
        brandName: "FlowOps QA",
        country: "ZA",
        currency: "ZAR",
      };
    } else if (pathname === "/billing/entitlements") {
      payload = {
        plan: "enterprise",
        effectivePlan: "enterprise",
        planName: "Enterprise",
        onTrial: false,
        trialEndsAt: null,
        trialDaysLeft: 0,
        features: { rail: true },
        limits: { waybillsPerMonth: 1000, drivers: 100, users: 100, branches: 100 },
        usage: {},
      };
    } else if (pathname === "/rail/overview") {
      payload = {
        metrics: {
          activeConsignments: 0,
          inTransit: 0,
          atInterchange: 0,
          wagonsInTransit: 0,
          totalWagons: 0,
          tonnageMoved: 0,
          tonnagePlanned: 0,
          onTimePct: null,
          avgTransitHours: null,
          avgInterchangeDwellHours: null,
          atRisk: 0,
        },
        byCorridor: [],
      };
    } else if (pathname === "/rail/consignments" || pathname === "/rail/schedules/imports" || pathname === "/rail/handshake/reports") {
      payload = [];
    } else if (pathname === "/rail/possessions/conflicts") {
      payload = { conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 0 };
    } else if (pathname === "/rail/handshake/overview") {
      payload = {
        totalReports: 0,
        openItems: 0,
        disputes: 0,
        atRegulator: 0,
        recoverableExposureZar: 0,
        byResponsibleParty: [],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: payload }),
    });
  });
}

for (const route of routes) {
  test(`${route.path} loads directly, survives refresh, and has the correct expanded/active Rail sidebar item`, async ({ page, isMobile }) => {
    await installAuthenticatedApi(page);
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.pageHeading })).toBeVisible();

    if (isMobile) {
      await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    }

    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(navigation.getByRole("button", { name: "Collapse RAIL section" })).toHaveAttribute("aria-expanded", "true");
    const activeLink = navigation.getByRole("link", { name: route.navLabel, exact: true });
    await expect(activeLink).toHaveAttribute("aria-current", "page");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: route.pageHeading })).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
    const refreshedNavigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(refreshedNavigation.getByRole("button", { name: "Collapse RAIL section" })).toHaveAttribute("aria-expanded", "true");
    await expect(refreshedNavigation.getByRole("link", { name: route.navLabel, exact: true })).toHaveAttribute("aria-current", "page");
  });
}

test("Rail controls are keyboard reachable, Enter activates a section, and Escape dismisses a dialog", async ({ page }) => {
  await installAuthenticatedApi(page);
  await page.goto("/rail");
  const sections = page.getByRole("group", { name: "Rail operations sections" });
  const consignments = sections.getByRole("button", { name: "Consignments" });
  const slots = sections.getByRole("button", { name: "Slot Applications & Compliance" });
  await consignments.focus();
  await page.keyboard.press("Tab");
  await expect(slots).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(slots).toHaveAttribute("aria-pressed", "true");

  await page.goto("/rail/handshake");
  await page.getByRole("button", { name: /New daily report/ }).click();
  const dialog = page.getByRole("dialog", { name: "New daily handshake report" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("sidebar navigation follows browser back/forward and route refresh", async ({ page, isMobile }) => {
  test.skip(isMobile, "The direct-route matrix exercises the mobile navigation drawer; history is asserted on desktop.");
  await installAuthenticatedApi(page);
  await page.goto("/rail");
  await expect(page.getByRole("heading", { level: 1, name: "Rail & Intermodal Operations" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Timetable Explorer" }).click();
  await expect(page).toHaveURL(/\/rail\/timetable$/);
  await expect(page.getByRole("heading", { level: 1, name: "Rail Timetable" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/rail$/);
  await expect(page.getByRole("heading", { level: 1, name: "Rail & Intermodal Operations" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/rail\/timetable$/);
  await expect(page.getByRole("link", { name: "Timetable Explorer" })).toHaveAttribute("aria-current", "page");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Rail Timetable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Timetable Explorer" })).toHaveAttribute("aria-current", "page");
});

test("the screenshot's tenant map URL is not mistaken for an existing Rail or dispatch route", async ({ page }) => {
  await installAuthenticatedApi(page);
  await page.goto("/dashboard/rail-route-test-tenant/map");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Rail & Intermodal Operations" })).toHaveCount(0);
});
