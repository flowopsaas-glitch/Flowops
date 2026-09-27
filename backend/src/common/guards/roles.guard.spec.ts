import { ForbiddenException } from "@nestjs/common";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * NOTE: these tests are the contract for the default-allow behaviour and the
 * opt-in strict mode. They import @prisma/client transitively, so they need a
 * generated Prisma client (`npx prisma generate`) like the rest of the suite.
 */
describe("RolesGuard", () => {
  const makeContext = (user: unknown) =>
    ({
      getHandler: () => "handler",
      getClass: () => "class",
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  const guard = (required: unknown) =>
    new RolesGuard({ getAllAndOverride: () => required } as any);

  afterEach(() => {
    delete process.env.RBAC_STRICT;
  });

  it("allows a role that is on the list", () => {
    expect(
      guard(["ADMIN", "MANAGER"]).canActivate(makeContext({ role: "ADMIN" })),
    ).toBe(true);
  });

  it("rejects a role that is not on the list", () => {
    expect(() =>
      guard(["ADMIN"]).canActivate(makeContext({ role: "VIEWER" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects an unauthenticated request when roles are required", () => {
    expect(() => guard(["ADMIN"]).canActivate(makeContext(undefined))).toThrow(
      "Access denied",
    );
  });

  describe("routes with no @Roles metadata", () => {
    it("allows them by default (current production behaviour)", () => {
      expect(
        guard(undefined).canActivate(makeContext({ role: "VIEWER" })),
      ).toBe(true);
      expect(guard([]).canActivate(makeContext({ role: "DRIVER" }))).toBe(true);
    });

    it("does NOT reject public routes that have no user", () => {
      // @Public routes still pass through this guard. Requiring a user before
      // the no-metadata branch would 403 every public endpoint.
      expect(guard(undefined).canActivate(makeContext(undefined))).toBe(true);
    });

    it("rejects them when RBAC_STRICT is enabled", () => {
      process.env.RBAC_STRICT = "true";
      expect(() =>
        guard(undefined).canActivate(makeContext({ role: "ADMIN" })),
      ).toThrow(ForbiddenException);
    });

    it("still honours explicit roles when RBAC_STRICT is enabled", () => {
      process.env.RBAC_STRICT = "true";
      expect(guard(["ADMIN"]).canActivate(makeContext({ role: "ADMIN" }))).toBe(
        true,
      );
      expect(() =>
        guard(["ADMIN"]).canActivate(makeContext({ role: "USER" })),
      ).toThrow(ForbiddenException);
    });
  });

  it("reads metadata from both handler and class", () => {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === ROLES_KEY ? ["ADMIN"] : undefined,
    } as any;
    expect(
      new RolesGuard(reflector).canActivate(makeContext({ role: "ADMIN" })),
    ).toBe(true);
  });
});
