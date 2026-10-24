import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectRouteInventory } from "./rbac-inventory.mjs";

function fixture(t, source) {
  const dir = mkdtempSync(join(tmpdir(), "flowops-rbac-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "sample.controller.ts"), source);
  return collectRouteInventory(dir);
}

const HEADER = `import { Controller, Get, Post, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';
`;

test("method-level @Roles does not leak into the next route", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
@Controller('x')
export class XController {
  @Roles(UserRole.ADMIN)
  @Post('one')
  one() {}

  @Get('two')
  two() {}
}`,
  );
  const byHandler = Object.fromEntries(allRoutes.map((r) => [r.handler, r]));
  assert.equal(byHandler.one.roles, true);
  assert.equal(byHandler.two.roles, false, "the following GET must stay unroled");
});

test("class-level @Roles covers every route in the controller", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('x')
export class XController {
  @Get('a')
  a() {}
  @Post('b')
  b() {}
}`,
  );
  assert.ok(allRoutes.every((r) => r.roles), "class metadata restricts all routes");
});

test("class-level @Public marks every route public", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
@Public()
@Controller('portal')
export class PortalController {
  @Get('branding')
  branding() {}
}`,
  );
  assert.ok(allRoutes.every((r) => r.public && !r.roles));
});

test("comments mentioning @Roles()/@Public() are not metadata", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
// This controller used to say @Public() and @Roles(UserRole.ADMIN) here.
/**
 * @Public() bypasses the global guard; @Roles() is applied elsewhere.
 */
@Controller('x')
export class XController {
  /**
   * @Public() so the tenant JWT guard is skipped.
   */
  @Get('a')
  a() {}
}`,
  );
  const a = allRoutes.find((r) => r.handler === "a");
  assert.equal(a.public, false, "comment text is not @Public metadata");
  assert.equal(a.roles, false, "comment text is not @Roles metadata");
});

test("decorators below the HTTP verb count (Nest applies them to the handler)", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
@Controller('x')
export class XController {
  @Post('one')
  @Roles(UserRole.ADMIN)
  one() {}

  @Get('two')
  two() {}
}`,
  );
  const byHandler = Object.fromEntries(allRoutes.map((r) => [r.handler, r]));
  assert.equal(byHandler.one.roles, true, "@Roles below @Post is still metadata");
  assert.equal(byHandler.two.roles, false);
});

test("a comment line between @Public() and the verb does not hide it", (t) => {
  const { allRoutes } = fixture(
    t,
    `${HEADER}
@Controller('x')
export class XController {
  @Public()
  // A login route must still be rate-limited; see the throttle note.
  @Post('login')
  login() {}
}`,
  );
  assert.equal(allRoutes[0].public, true);
});

test("owner-only and any-authenticated routes are deliberate decisions", (t) => {
  const { allRoutes, summary } = fixture(
    t,
    `${HEADER}
import { OwnerOnly } from '../common/decorators/owner-only.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';

@OwnerOnly()
@Controller('owner/x')
export class OwnerXController {
  @Get('a')
  a() {}
}

@Controller('y')
export class YController {
  @AnyAuthenticated()
  @Get('me')
  me() {}

  @Get('undecided')
  undecided() {}
}`,
  );
  const byHandler = Object.fromEntries(allRoutes.map((r) => [r.handler, r]));
  assert.equal(byHandler.a.owner, true);
  assert.equal(byHandler.me.anyAuth, true);
  assert.equal(byHandler.undecided.owner, false);
  assert.equal(byHandler.undecided.anyAuth, false);
  assert.equal(summary.routesOwnerOnly, 1);
  assert.equal(summary.routesAnyAuthenticated, 1);
  assert.equal(summary.routesWithNoRoles, 1, "only the undecided route remains");
});

test("the real tree: every route is exactly one of roles / public / unroled", () => {
  const { allRoutes } = collectRouteInventory();
  assert.equal(
    allRoutes.filter((r) => r.handler === "(unknown)").length,
    0,
    "every route must resolve to a handler name",
  );
  const unroled = allRoutes.filter((r) => !r.roles && !r.public);
  const roles = allRoutes.filter((r) => r.roles && !r.public);
  const isPublic = allRoutes.filter((r) => r.public);
  assert.equal(roles.length + isPublic.length + unroled.length, allRoutes.length);
  assert.ok(roles.length > 0, "role-restricted routes exist");
  assert.ok(isPublic.length > 0, "public routes exist");
});

const SENSITIVE_MODULES = [
  "src/accounting/accounting.controller.ts",
  "src/accounting-integrations/accounting-integrations.controller.ts",
  "src/warehouse-management/warehouse.controller.ts",
  "src/process-control/process-control.controller.ts",
  "src/product-master/product-master.controller.ts",
];

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

test("sensitive write surfaces carry server-side @Roles", () => {
  const { allRoutes } = collectRouteInventory();
  const offenders = allRoutes.filter(
    (r) =>
      SENSITIVE_MODULES.includes(r.file) &&
      WRITE_METHODS.has(r.method) &&
      !r.roles &&
      !r.public,
  );
  assert.deepEqual(
    offenders.map((r) => `${r.file}#${r.handler} ${r.method}`),
    [],
    "every sensitive write must be role-restricted (option-2 policy)",
  );
});

test("the shortlist of high-value routes is role-restricted", () => {
  const { allRoutes } = collectRouteInventory();
  const index = new Map(allRoutes.map((r) => [`${r.file}#${r.handler}`, r]));
  const shortlist = [
    "src/accounting/accounting.controller.ts#createCredit",
    "src/accounting/accounting.controller.ts#voidCredit",
    "src/accounting/accounting.controller.ts#approveCommission",
    "src/accounting/accounting.controller.ts#payCommission",
    "src/accounting-integrations/accounting-integrations.controller.ts#disconnect",
    "src/warehouse-management/warehouse.controller.ts#adjustStock",
    "src/warehouse-management/warehouse.controller.ts#approveCount",
    "src/warehouse-management/warehouse.controller.ts#receiveGoods",
    "src/process-control/process-control.controller.ts#reviewChange",
    "src/process-control/process-control.controller.ts#updateVersionSteps",
    "src/product-master/product-master.controller.ts#approveProduct",
    "src/product-master/product-master.controller.ts#createProduct",
    "src/product-master/product-master.controller.ts#removeAlias",
  ];
  for (const key of shortlist) {
    const route = index.get(key);
    assert.ok(route, `route missing from inventory: ${key}`);
    assert.equal(route.roles, true, `expected @Roles on ${key}`);
  }
});
