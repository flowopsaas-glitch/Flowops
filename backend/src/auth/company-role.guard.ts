import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ROLES_KEY } from "./roles.decorator";

type RequestUser = {
  sub?: number;
  id?: number;
  email?: string;
  role?: string;
  companyId?: number | null;
};

type RequestWithUser = {
  user?: RequestUser;
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(
    private readonly defaultAllowedRoles: string[],
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException("User not found on request");
    }

    const userRole = String(user.role || "").toUpperCase();

    // FlowOps hidden owner layer:
    // SUPER_ADMIN always passes backend authorization checks.
    // This does NOT mean it must be visible in tenant UI.
    if (userRole === "SUPER_ADMIN") {
      return true;
    }

    // Route-specific roles from @Roles(...)
    const routeRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    const effectiveAllowedRoles =
      routeRoles.length > 0 ? routeRoles : this.defaultAllowedRoles;

    if (!effectiveAllowedRoles.includes(userRole)) {
      throw new ForbiddenException("Insufficient role");
    }

    // Tenant users must belong to a company
    if (user.companyId == null) {
      throw new ForbiddenException("Tenant user has no company assigned");
    }

    // Optional company isolation check:
    // if request carries a companyId, it must match the signed-in tenant company.
    const requestedCompanyId = this.extractRequestedCompanyId(req);

    if (
      requestedCompanyId !== null &&
      Number.isFinite(requestedCompanyId) &&
      requestedCompanyId > 0 &&
      Number(user.companyId) !== requestedCompanyId
    ) {
      throw new ForbiddenException("Cross-tenant access denied");
    }

    return true;
  }

  private extractRequestedCompanyId(req: RequestWithUser): number | null {
    const headerValue = req.headers?.["x-company-id"];
    const headerRaw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const fromHeader = this.toPositiveNumber(headerRaw);
    if (fromHeader !== null) return fromHeader;

    const fromParams = this.toPositiveNumber(req.params?.companyId);
    if (fromParams !== null) return fromParams;

    const fromBody = this.toPositiveNumber(
      req.body?.companyId as string | number | undefined,
    );
    if (fromBody !== null) return fromBody;

    const fromQuery = this.toPositiveNumber(
      req.query?.companyId as string | number | undefined,
    );
    if (fromQuery !== null) return fromQuery;

    return null;
  }

  private toPositiveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }
}