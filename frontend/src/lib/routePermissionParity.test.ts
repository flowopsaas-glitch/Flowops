import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// Vitest rewrites import.meta.url to a non-file: URL, so resolve against the
// project root instead — the test runner is always invoked from here.
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const layout = readFileSync(
  resolve(process.cwd(), "src/components/layout/AppLayout.tsx"),
  "utf8",
);
const permsSource = readFileSync(
  resolve(process.cwd(), "src/lib/tenantUserPermissions.ts"),
  "utf8",
);

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

function routes(): Route[] {
  const out: Route[] = [];
  for (const m of app.matchAll(
    /<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*(?:\/>|>)/g,
  )) {
    out.push({ path: m[1], element: m[2] });
  }
  return out;
}

const UNGUARDED_BY_DESIGN = new Set([
  // RequirePermission redirects unauthorized users to /dashboard. Guarding it
  // would send them straight back into the guard that just rejected them.
  "/dashboard",
]);

const nav = navEntries();
const routeList = routes();
const routeByPath = new Map(routeList.map((r) => [r.path, r]));

describe("route/sidebar permission parity", () => {
  it("finds the nav and route lists (the parsers are not silently empty)", () => {
    expect(nav.length).toBeGreaterThan(40);
    expect(routeList.length).toBeGreaterThan(40);
  });

  it("every nav entry with a permission has a guarded route", () => {
    const offenders: string[] = [];
    for (const entry of nav) {
      if (!entry.perm) continue;
      if (UNGUARDED_BY_DESIGN.has(entry.to)) continue;
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
    const union = permsSource.slice(
      permsSource.indexOf("export type TenantNavPermissionKey ="),
      permsSource.indexOf("export type TenantNavPermissions"),
    );
    const known = new Set([...union.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]));
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
});
