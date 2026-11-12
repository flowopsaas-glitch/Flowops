// Vite's ?raw imports, not node:fs. tsconfig.app.json pins types to
// ["vite/client"] — the app is browser code — so a test that reaches for
// node:fs fails the TypeScript check even though vitest runs it happily.
import appSource from "../App.tsx?raw";
import layoutSource from "../components/layout/AppLayout.tsx?raw";
import { ALL_TENANT_NAV_PERMISSION_KEYS } from "./tenantUserPermissions";
import { describe, expect, it } from "vitest";

/**
 * Route / sidebar permission parity.
 *
 * `RequirePermission` enforces the tenant nav-permission matrix at the URL
 * layer; the sidebar in AppLayout filters links by the same matrix. Hiding a
 * link is not access control on its own — a user can type the URL — and a
 * guarded route is only half a fix if the sidebar still advertises the page to
 * someone who will be bounced.
 *
 * These two surfaces drift silently, because nothing connects them: someone
 * adds a page, copies a neighbouring <Route>, and forgets the `perm` that the
 * neighbouring nav entry carries. This test is the connection.
 *
 * It asserts, from the source of both files:
 *
 *   1. a nav entry that declares a `perm` has a route guarded by
 *      RequirePermission,
 *   2. a guarded route and its nav entry name the SAME permission, and
 *   3. /dashboard stays unguarded — it is where RequirePermission sends
 *      everyone it rejects, so gating it would be a redirect loop, not a
 *      security improvement.
 *
 * Deliberately NOT asserted: that every route has a permission. Twenty-three
 * nav entries carry no `perm` at all, and choosing one for each is a decision
 * about who should see those pages — it is not something a test can invent.
 * Rule 1 starts biting the moment any of them is given one.
 */

const app = appSource;
const layout = layoutSource;

/** Nav entries: { label, to, perm? } from the sidebar's page list. */
type NavEntry = { label: string; to: string; perm?: string };

function navEntries(): NavEntry[] {
  const out: NavEntry[] = [];
  for (const m of layout.matchAll(/\{[^{}]*?to:\s*"([^"]+)"[^{}]*\}/g)) {
    const block = m[0];
    const to = m[1];
    const label = block.match(/label:\s*"([^"]+)"/)?.[1] ?? to;
    const perm = block.match(/perm:\s*"([^"]+)"/)?.[1];
    if (block.includes("section:")) out.push({ label, to, perm });
  }
  return out;
}

/** Routes: { path, element } — both the self-closing and nested forms. */
type Route = { path: string; element: string };

function routes(source: string = app): Route[] {
  const out: Route[] = [];
  for (const m of source.matchAll(
    /<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*(?:\/>|>)/g,
  )) {
    out.push({ path: m[1], element: m[2] });
  }
  return out;
}

/**
 * Only the routes the authenticated shell renders.
 *
 * App.tsx declares public routes — /login, /track, /portal, the legal pages —
 * after the AppLayout block closes. They are unguarded because they must be
 * reachable signed-out, and including them here would bury the routes that
 * actually matter under dozens of correct exemptions.
 *
 * The slice is bounded by the first closing tag at the same indentation as the
 * opening, so it breaks loudly if App.tsx is re-indented rather than silently
 * returning the wrong set.
 */
function appLayoutBlock(): string {
  const marker = '<Route element={<AppLayout />}>';
  const start = app.indexOf(marker);
  if (start < 0) throw new Error('AppLayout route not found — the parser is blind');
  const end = app.indexOf('\n            </Route>', start);
  if (end < 0) throw new Error('AppLayout closing tag not found — the parser is blind');
  return app.slice(start, end);
}

/**
 * Routes that intentionally carry no access decision, each with the reason.
 *
 * This is the ratchet. Before it existed, seven routes had no gate at all —
 * /fleet-intelligence, /safety-zones, /trip-legs, /border-dwell and two
 * incident screens — reachable by any authenticated user of any role, while
 * the APIs behind them were role-restricted. Nothing failed, because the only
 * checks were conditional on a nav entry already declaring a permission. A
 * route with no entry and no guard fell through every one of them.
 *
 * The list is exhaustive rather than open-ended: a new route without a
 * decision fails this file until it either gets a guard or gets an entry here
 * with a reason a reviewer can argue with. `staleEntries` below keeps the
 * escape hatch from quietly growing — an exemption for a route that no longer
 * exists is a bug, not a harmless leftover.
 *
 * A reason must be a sentence. Entries are reviewed by people who were not in
 * the room, so "legacy" or "TODO" is not an acceptable entry.
 */
const UNGUARDED_BY_DESIGN: Record<string, string> = {
  // RequirePermission redirects unauthorized users to /dashboard. Guarding it
  // would send them straight back into the guard that just rejected them, and
  // AGENT and USER deliberately default to no permissions at all, so they
  // would bounce forever on the page that is meant to be their landing.
  "/dashboard":
    "RequirePermission redirects denied users here, and AGENT/USER default to no permissions at all, so gating it is an infinite redirect loop rather than a security improvement.",

  // A redirect, not a page: it renders nothing and holds no data.
  "/":
    "A redirect to /dashboard. It renders no component and exposes nothing; the destination is what carries the access decision.",

  // The user arrives here from the payment provider, mid-flow. There is no
  // meaningful permission to check, and blocking it breaks a completed payment.
  "/billing/callback":
    "Provider redirect target: the user arrives from the billing provider mid-checkout. There is no page state to protect, and gating it would strand a completed payment.",

  // Onboarding has to be reachable before any permissions exist, or a tenant
  // can never finish setting themselves up.
  "/onboarding":
    "Setup must be reachable before a tenant has any permissions configured; gating it would make the product impossible to start using.",

};

const nav = navEntries();
const routeList = routes();
const routeByPath = new Map(routeList.map((r) => [r.path, r]));

/** The authenticated routes only — see appLayoutBlock. */
const shellRoutes = routes(appLayoutBlock());
const shellRouteByPath = new Map(shellRoutes.map((r) => [r.path, r]));

describe("route/sidebar permission parity", () => {
  it("finds the nav and route lists (the parsers are not silently empty)", () => {
    expect(nav.length).toBeGreaterThan(40);
    expect(routeList.length).toBeGreaterThan(40);
  });

  it("finds the authenticated shell routes, and they are not the whole tree", () => {
    // Both halves matter. Zero means the slice broke; equal to routeList means
    // the slice did nothing and the public routes leaked back in.
    expect(shellRoutes.length).toBeGreaterThan(40);
    expect(shellRoutes.length).toBeLessThan(routeList.length);
  });

  it("every nav entry with a permission has a guarded route", () => {
    const offenders: string[] = [];
    for (const entry of nav) {
      if (!entry.perm) continue;
      if (entry.to in UNGUARDED_BY_DESIGN) continue;
      const route = routeByPath.get(entry.to);
      if (!route) continue; // no matching top-level route; nothing to assert
      if (!route.element.includes("RequirePermission")) {
        offenders.push(`${entry.to} (sidebar hides it behind "${entry.perm}")`);
      }
    }
    expect(
      offenders,
      "the sidebar hides these links but the URL still opens the page",
    ).toEqual([]);
  });

  it("a guarded route and its nav entry name the same permission", () => {
    const mismatches: string[] = [];
    for (const entry of nav) {
      if (!entry.perm) continue;
      const route = routeByPath.get(entry.to);
      if (!route) continue;
      const m = route.element.match(/<RequirePermission[^>]*perm="([^"]+)"/);
      if (!m) continue; // covered by the previous test
      if (m[1] !== entry.perm) {
        mismatches.push(`${entry.to}: sidebar "${entry.perm}" vs route "${m[1]}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("leaves /dashboard unguarded, because the guard redirects there", () => {
    const route = routeByPath.get("/dashboard");
    expect(route, "/dashboard is the guard's redirect target").toBeDefined();
    expect(route!.element.includes("RequirePermission")).toBe(false);
  });

  it("never uses a permission key outside the known set", () => {
    // A perm the matrix does not define is always falsy, so it fails closed for
    // every role — including admins. This catches a typo that would otherwise
    // read as a working gate.
    //
    // The key set is read from the live module rather than sliced out of the
    // type union's source text: the union is now derived from the permission
    // registry, so its source no longer contains a list of quoted keys to
    // scrape. Reading the value also keeps this honest if the union and the
    // runtime list ever stop being the same thing.
    const known = new Set<string>(ALL_TENANT_NAV_PERMISSION_KEYS);
    expect(known.size).toBeGreaterThan(20);

    const unknown = new Set<string>();
    for (const entry of nav) {
      if (entry.perm && !known.has(entry.perm)) unknown.add(entry.perm);
    }
    for (const route of routeList) {
      for (const m of route.element.matchAll(
        /<RequirePermission[^>]*perm="([^"]+)"/g,
      )) {
        if (!known.has(m[1])) unknown.add(m[1]);
      }
    }
    expect([...unknown]).toEqual([]);
    expect([...unknown]).toEqual([]);
  });
  it("every route has an access decision, or a written exemption", () => {
    // The gap this file used to leave open: the checks above only fire for a
    // route whose sidebar entry declares a `perm`. A route with no sidebar
    // entry and no guard was invisible to all of them. Seven routes lived in
    // that blind spot.
    const decisions = /RequirePermission|RequireFeature|adminOnly/;
    const undecided = shellRoutes
      .filter((r) => !decisions.test(r.element))
      .filter((r) => !(r.path in UNGUARDED_BY_DESIGN))
      .map((r) => r.path);

    expect(
      undecided,
      "these routes are reachable by any authenticated user with no access check; " +
        "add a RequirePermission/RequireFeature gate, or an entry in UNGUARDED_BY_DESIGN with a reason",
    ).toEqual([]);
  });

  it("gives every exemption a reason a reviewer can argue with", () => {
    for (const [path, reason] of Object.entries(UNGUARDED_BY_DESIGN)) {
      expect(reason.trim().length, `exemption for ${path} has no reason`).toBeGreaterThan(40);
    }
  });

  it("has no exemption for a route that no longer exists", () => {
    // An exemption outliving its route is how an escape hatch becomes a habit:
    // the entry stays, and a future route with the same path inherits a
    // decision nobody made for it.
    const stale = Object.keys(UNGUARDED_BY_DESIGN).filter(
      (p) => !shellRouteByPath.has(p),
    );
    expect(stale, "exemptions pointing at routes that no longer exist").toEqual([]);
  });
});
