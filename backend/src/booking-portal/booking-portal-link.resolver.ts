import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolving a booking link by its token — the step that happens BEFORE a tenant
 * is known.
 *
 * The token is the only thing the caller has; the company is the answer, not
 * the input. There is therefore no companyId to scope the query by and no
 * `withTenant()` to wrap it in, which is the same position `auth.service.ts` is
 * in when it looks a user up by email before login.
 *
 * That is why this lives in its own file rather than in the service next door.
 * The tenant-context coverage scanner exempts by file, so keeping the two
 * unavoidable unscoped lookups here lets every other query in the module run
 * inside a real tenant context. Folding them into booking-portal.service.ts
 * would exempt that whole file — including the queries that genuinely can and
 * must be scoped.
 *
 * The file is registered in tenant-scope-policy.mjs with this reason, and the
 * scanner fails if the entry stops matching anything.
 */

export interface ResolvedBookingLink {
  id: string;
  companyId: string;
  label: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  /**
   * Optional only because the local Prisma stub types a selected relation
   * loosely; the real client narrows `select` to a non-optional object. The
   * column is a required FK with ON DELETE CASCADE, so in the database it is
   * always present — the callers still fall back rather than assuming.
   */
  company?: {
    id: string;
    name: string;
    brandName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    phone: string | null;
  } | null;
}

@Injectable()
export class BookingPortalLinkResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByToken(token: string): Promise<ResolvedBookingLink | null> {
    return this.prisma.bookingPortalLink.findUnique({
      where: { token },
      select: {
        id: true,
        companyId: true,
        label: true,
        isActive: true,
        expiresAt: true,
        company: {
          select: {
            id: true,
            name: true,
            brandName: true,
            logoUrl: true,
            primaryColor: true,
            phone: true,
          },
        },
      },
    });
  }
}
