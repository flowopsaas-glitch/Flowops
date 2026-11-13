import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withCompanyId } from '../common/security/tenant.util';
import { BookingPortalLinkResolver } from './booking-portal-link.resolver';
import {
  ALLOWED_TRANSITIONS,
  BOOKING_REQUEST_STATUSES,
  BookingRequestStatus,
  CreateLinkDto,
  ListRequestsQueryDto,
  PublicSubmitRequestDto,
  TransitionRequestDto,
  UpdateLinkDto,
} from './dto/booking-portal.dto';

/**
 * Booking portal — a shareable link that lets a carrier's own customers submit
 * delivery requests without an account.
 *
 * Tenant model
 * ------------
 * `BookingPortalLink` is tenant-owned and RLS-protected. `BookingRequest` was
 * not: it shipped carrying only `linkId`, so it had no tenant column for a
 * policy to test. The 20261115090000 migration gives it one, copied from the
 * link, which makes the link the authority for tenancy.
 *
 * Every query on the tenant surface runs inside `prisma.withTenant()`, which
 * sets `app.company_id` for the transaction and lets Postgres enforce the row
 * policy. The `where: { companyId }` filters are kept as well: RLS is the
 * second line of defence, not an excuse to drop the first. Phase 2 of the RLS
 * rollout is not switched on in production yet, so today the filter is the one
 * doing the work — and the coverage ratchet is what stops this module from
 * adding to the unprotected backlog.
 *
 * The public surface has no session. It resolves the link by token (the one
 * lookup that cannot be scoped, isolated in booking-portal-link.resolver.ts),
 * then runs the write inside `withTenant(link.companyId)` — so even the
 * anonymous path lands under a real tenant context.
 */

/** Link tokens are bearer capabilities in a URL; they must not be guessable. */
const TOKEN_BYTES = 32;

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

@Injectable()
export class BookingPortalService {
  private readonly logger = new Logger(BookingPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly links: BookingPortalLinkResolver,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // LINKS (tenant surface)
  // ═══════════════════════════════════════════════════════════════════════

  async listLinks(companyId: string, includeInactive = false) {
    return this.prisma.withTenant(companyId, (tx) =>
      tx.bookingPortalLink.findMany({
        where: includeInactive ? { companyId } : { companyId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          token: true,
          label: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
          _count: { select: { requests: true } },
        },
      }),
    );
  }

  async createLink(companyId: string, dto: CreateLinkDto) {
    const data = withCompanyId(companyId, {
      token: randomBytes(TOKEN_BYTES).toString('base64url'),
      label: dto.label ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    return this.prisma.withTenant(companyId, (tx) =>
      tx.bookingPortalLink.create({
        data,
        select: {
          id: true,
          token: true,
          label: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    );
  }

  async updateLink(companyId: string, id: string, dto: UpdateLinkDto) {
    return this.prisma.withTenant(companyId, async (tx) => {
      // Inlined rather than factored into a helper: the coverage scanner
      // classifies an operation by whether it sits lexically inside the
      // withTenant() call, and it cannot see through a method call. Hiding
      // this behind assertLinkOwned() reported it as an unprotected read when
      // it was in fact protected.
      const link = await tx.bookingPortalLink.findFirst({
        where: { id, companyId },
        select: { id: true },
      });
      if (!link) throw new NotFoundException('Booking portal link not found');

      return tx.bookingPortalLink.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.expiresAt !== undefined ? { expiresAt: new Date(dto.expiresAt) } : {}),
        },
        select: {
          id: true,
          token: true,
          label: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    });
  }

  /**
   * Revoke rather than delete.
   *
   * Deleting the link cascades away the requests under it, which destroys the
   * record of what customers asked for. Revoking keeps the history and only
   * stops the URL from working.
   */
  async revokeLink(companyId: string, id: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const link = await tx.bookingPortalLink.findFirst({
        where: { id, companyId },
        select: { id: true },
      });
      // Same answer for "not yours" and "not there": distinguishing them would
      // let a caller enumerate other tenants' link ids.
      if (!link) throw new NotFoundException('Booking portal link not found');

      return tx.bookingPortalLink.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, isActive: true, label: true },
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REQUESTS (tenant surface)
  // ═══════════════════════════════════════════════════════════════════════

  async listRequests(companyId: string, query: ListRequestsQueryDto = {}) {
    const take = Math.min(query.take ?? DEFAULT_TAKE, MAX_TAKE);
    const skip = query.skip ?? 0;

    return this.prisma.withTenant(companyId, async (tx) => {
      const where: Record<string, unknown> = { companyId };
      if (query.status) where.status = query.status;
      if (query.linkId) where.linkId = query.linkId;

      const [items, total] = await Promise.all([
        tx.bookingRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          select: {
            id: true,
            status: true,
            senderName: true,
            senderPhone: true,
            senderAddress: true,
            recipientName: true,
            recipientPhone: true,
            recipientAddress: true,
            notes: true,
            linkId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.bookingRequest.count({ where }),
      ]);

      return { items, total, take, skip };
    });
  }

  async getRequest(companyId: string, id: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const request = await tx.bookingRequest.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          status: true,
          senderName: true,
          senderPhone: true,
          senderAddress: true,
          recipientName: true,
          recipientPhone: true,
          recipientAddress: true,
          notes: true,
          linkId: true,
          createdAt: true,
          updatedAt: true,
          link: { select: { id: true, label: true } },
        },
      });
      if (!request) throw new NotFoundException('Booking request not found');
      return request;
    });
  }

  /**
   * Accept or reject a submitted request.
   *
   * Only `pending` moves. Accepting twice is not idempotent — a second accept
   * would mean a second quote — so a decided request is a 409, not a no-op.
   */
  async transitionRequest(companyId: string, id: string, dto: TransitionRequestDto) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const current = await tx.bookingRequest.findFirst({
        where: { id, companyId },
        select: { id: true, status: true, notes: true },
      });
      if (!current) throw new NotFoundException('Booking request not found');

      const from = this.normaliseStatus(current.status);
      const allowed = ALLOWED_TRANSITIONS[from] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new ConflictException(
          `Booking request is '${from}' and cannot move to '${dto.status}'`,
        );
      }

      // The schema has no decision-note column and one operator-only string is
      // not worth a migration, so the note is appended to the customer's own.
      // Appending keeps a rejected request self-explanatory; replacing would
      // destroy the customer's original instruction.
      const notes = dto.note
        ? `${current.notes ? `${current.notes}\n` : ''}[${dto.status}] ${dto.note}`.slice(0, 1000)
        : undefined;

      return tx.bookingRequest.update({
        where: { id },
        data: { status: dto.status, ...(notes !== undefined ? { notes } : {}) },
        select: { id: true, status: true, notes: true, updatedAt: true },
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC SURFACE (no session — capability token in the path)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Resolve a link for an anonymous visitor.
   *
   * Returns branding only. It must not echo back the request list — that is
   * tenant data, and this endpoint has no tenant.
   */
  async resolvePublicLink(token: string) {
    const link = await this.links.resolveByToken(token);

    if (!link || !link.isActive) throw new NotFoundException('This booking link is not available');
    if (this.isExpired(link.expiresAt)) {
      throw new NotFoundException('This booking link has expired');
    }

    return {
      label: link.label,
      company: {
        name: link.company?.brandName || link.company?.name || '',
        logo: link.company?.logoUrl ?? null,
        color: link.company?.primaryColor || '#3b82f6',
        phone: link.company?.phone ?? null,
      },
    };
  }

  /**
   * Submit a request through a link.
   *
   * The token lookup cannot be scoped — the company is the answer, not the
   * input — but everything after it can be, so the write runs inside
   * `withTenant(link.companyId)`. A public endpoint therefore still lands under
   * a real tenant context rather than being the one path RLS never covers.
   *
   * companyId comes from the link and never from the body. If a caller could
   * name the tenant, the denormalised column would be advisory rather than
   * authoritative, and RLS would be enforcing a value the client chose.
   */
  async submitPublicRequest(token: string, dto: PublicSubmitRequestDto) {
    const link = await this.links.resolveByToken(token);

    if (!link || !link.isActive) throw new NotFoundException('This booking link is not available');
    if (this.isExpired(link.expiresAt)) {
      throw new NotFoundException('This booking link has expired');
    }

    const created = await this.prisma.withTenant(link.companyId, (tx) =>
      tx.bookingRequest.create({
        data: {
          companyId: link.companyId,
          linkId: link.id,
          status: 'pending',
          senderName: dto.senderName,
          senderPhone: dto.senderPhone,
          senderAddress: dto.senderAddress,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          recipientAddress: dto.recipientAddress,
          notes: dto.notes ?? null,
        },
        select: { id: true, status: true, createdAt: true },
      }),
    );

    this.logger.log(`booking request ${created.id} received via link ${link.id}`);
    return created;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private isExpired(expiresAt: Date | null | undefined): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() <= Date.now();
  }

  /**
   * Coerce a stored status into the known set.
   *
   * Rows written before this module existed — or by the column default — may
   * hold a value outside BOOKING_REQUEST_STATUSES. Treating those as `pending`
   * would silently resurrect a decided request, so they are a hard error the
   * operator can see rather than a guess the system makes.
   */
  private normaliseStatus(raw: string): BookingRequestStatus {
    const status = raw as BookingRequestStatus;
    if (!BOOKING_REQUEST_STATUSES.includes(status)) {
      throw new BadRequestException(`Booking request has unknown status '${raw}'`);
    }
    return status;
  }
}
