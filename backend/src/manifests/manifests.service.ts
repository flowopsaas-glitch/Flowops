import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManifestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.manifest.findMany({
      where: { companyId },
      include: {
        driver: { select: { name: true, phone: true } },
        branch: { select: { name: true } },
        _count: { select: { waybills: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string, companyId: string) {
    const m = await this.prisma.manifest.findFirst({
      where: { id, companyId },
      include: {
        waybills: { include: { waybill: true } },
        driver: true,
        branch: true,
      },
    });
    if (!m) throw new NotFoundException('Manifest not found');
    return m;
  }

  /**
   * Chain-of-custody gate for loading a linehaul: a parcel may only be loaded
   * onto a manifest once it has been RECEIVED at the origin depot
   * (status AT_ORIGIN_HUB). This stops un-checked parcels being loaded onto a
   * truck. Can be disabled per-deployment via MANIFEST_REQUIRE_HUB_RECEIVE=false
   * (e.g. a pure direct-courier tenant that doesn't run depots).
   */
  private async assertLoadable(companyId: string, waybillIds: string[], db: any = this.prisma) {
    const requireHub = (process.env.MANIFEST_REQUIRE_HUB_RECEIVE ?? 'true') !== 'false';
    if (!requireHub || waybillIds.length === 0) return;

    const wbs = await db.waybill.findMany({
      where: { id: { in: waybillIds }, companyId },
      select: { id: true, trackingNumber: true, status: true },
    });

    // Any missing id, or any waybill not yet received at the origin hub, blocks the load.
    const foundIds = new Set(wbs.map((w) => w.id));
    const missing = waybillIds.filter((id) => !foundIds.has(id));
    const notReceived = wbs.filter((w) => w.status !== 'AT_ORIGIN_HUB');

    if (missing.length || notReceived.length) {
      const parts: string[] = [];
      if (notReceived.length) {
        parts.push(
          `not yet received at the depot: ${notReceived.map((w) => `${w.trackingNumber} (${w.status})`).join(', ')}`,
        );
      }
      if (missing.length) parts.push(`unknown waybill(s): ${missing.join(', ')}`);
      throw new BadRequestException(
        `Cannot load linehaul — ${parts.join('; ')}. Receive parcels at the depot (Warehouse Hub → Receive at Depot) before loading.`,
      );
    }
  }

  /**
   * Create a manifest: validate the load, allocate a code, insert.
   *
   * All three have to happen inside one tenant transaction.
   *
   * The code used to be `count + 1`. Two manifests created together both counted
   * the same rows and both got MAN-00001 — and because there is no unique
   * constraint on the code, nothing complained. The code is what a depot quotes
   * when it asks where a load is, so two trucks leaving with indistinguishable
   * paperwork is a real tracking failure, not a cosmetic one.
   *
   * The loadability check also used to run before the insert, outside any
   * transaction: a waybill could pass it and then be picked up by somebody else
   * before this insert landed. Checking inside the transaction closes that gap.
   *
   * The durable fix for the code is a unique index on (companyId, code). That
   * needs a migration and a check for existing duplicates first; flagged, not
   * done blind. The advisory lock gives the same guarantee today.
   */
  async create(companyId: string, dto: { waybillIds: string[]; branchId?: string; driverId?: string; destination?: string }) {
    return this.prisma.withTenant(companyId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`manifest-code:${companyId}`}))`;

      await this.assertLoadable(companyId, dto.waybillIds ?? [], tx);

      const count = await tx.manifest.count({ where: { companyId } });
      const code = `MAN-${String(count + 1).padStart(5, '0')}`;

      return tx.manifest
        .create({
          data: {
            code,
            companyId,
            branchId: dto.branchId,
            driverId: dto.driverId,
            waybills: {
              create: dto.waybillIds.map((waybillId, i) => ({ waybillId, sortOrder: i })),
            },
          },
          include: { waybills: { include: { waybill: true } } },
        })
        .catch((e: any) => {
          if (e?.code !== 'P2002') throw e;
          // (companyId, code) is unique as of migration
          // 20261113090000_unique_business_references. The advisory lock above
          // stops two concurrent creates colliding, so reaching here means the
          // code was ALREADY on a row: the allocation is COUNT()+1, so deleting
          // a manifest reissues its code. The transaction is already aborted,
          // so this translates rather than retries — and says so plainly,
          // because a bare 500 here would look like an outage.
          throw new ConflictException(
            `Manifest code ${code} is already in use by this company, so no manifest was created. ` +
              'The code sequence counts existing rows, so deleting a manifest can reissue its ' +
              'code. Please retry; if it repeats, a manifest code has drifted out of step.',
          );
        });
    });
  }

  async update(id: string, companyId: string, dto: any) {
    // Tenant-scoped: only mutate a manifest belonging to the caller's company.
    // companyId is re-asserted last, not just filtered in the WHERE clause.
    // `dto` is an untyped body, so a caller could otherwise put `companyId`
    // in the payload and move their manifest into another tenant's company —
    // the WHERE would still match (they own it now) and the write would
    // re-home it. Setting it explicitly makes the tenant of record the
    // authenticated one, never the requested one.
    const { companyId: _ignored, ...rest } = dto ?? {};
    const res = await this.prisma.manifest.updateMany({
      where: { id, companyId },
      data: { ...rest, companyId },
    });
    if (res.count === 0) throw new NotFoundException('Manifest not found');
    return this.prisma.manifest.findFirst({ where: { id, companyId } });
  }

  async receiveManifest(manifestId: string, companyId: string) {
    const manifest = await this.findOne(manifestId, companyId);
    // A linehaul arriving at the destination depot means its parcels are now
    // AT_DESTINATION_HUB (ready for last-mile dispatch) — NOT COLLECTED. The old
    // code set COLLECTED, which moved the parcel backwards in the lifecycle and
    // disagreed with the driver-portal linehaul-delivery path. Both now agree.
    const waybillIds = manifest.waybills.map((mw: any) => mw.waybillId);
    await this.prisma.waybill.updateMany({
      where: { id: { in: waybillIds }, companyId },
      data: { status: 'AT_DESTINATION_HUB' },
    });
    return this.update(manifestId, companyId, { dispatched: true, dispatchedAt: new Date() });
  }

  async createLinehaul(companyId: string, dto: { waybillIds: string[]; destinationBranchId: string }) {
    const manifest = await this.create(companyId, {
      waybillIds: dto.waybillIds,
      branchId: dto.destinationBranchId,
    });
    return manifest;
  }

  /**
   * Inbound manifests — what's currently en route TO a specific branch.
   * Used by destination depots to see incoming linehauls with:
   *  - Manifest code + parcel count
   *  - Sending driver name + phone + GPS (last known position)
   *  - Dispatch time (for ETA estimation)
   *  - Waybill tracking numbers in the manifest
   *
   * If branchId is null (user has no branch assigned), returns ALL
   * undispatched manifests for the company so the main hub sees everything.
   */
  async getInboundManifests(companyId: string, branchId?: string | null) {
    const where: any = { companyId, dispatched: false };
    if (branchId) where.branchId = branchId;

    const manifests = await this.prisma.manifest.findMany({
      where,
      include: {
        driver: { select: { name: true, phone: true, lastLat: true, lastLng: true, lastSeen: true, vehicleReg: true } },
        branch: { select: { name: true, address: true } },
        waybills: { include: { waybill: { select: { trackingNumber: true, recipientName: true, recipientAddress: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return manifests.map(m => ({
      id: m.id,
      code: m.code,
      destinationBranch: m.branch?.name ?? 'Unknown',
      destinationAddress: m.branch?.address ?? null,
      parcelCount: m.waybills.length,
      dispatchedAt: m.dispatchedAt,
      createdAt: m.createdAt,
      driver: m.driver ? {
        name: m.driver.name,
        phone: m.driver.phone,
        vehicleReg: m.driver.vehicleReg,
        lastLat: m.driver.lastLat,
        lastLng: m.driver.lastLng,
        lastSeen: m.driver.lastSeen,
      } : null,
      waybills: m.waybills.map(mw => ({
        trackingNumber: (mw.waybill as any)?.trackingNumber ?? 'N/A',
        recipientName: (mw.waybill as any)?.recipientName ?? 'Unknown',
        recipientAddress: (mw.waybill as any)?.recipientAddress ?? null,
      })),
      // AI-estimated ETA based on creation time (simple heuristic: 4h for intercity)
      estimatedArrival: new Date((m.createdAt as Date).getTime() + 4 * 60 * 60 * 1000).toISOString(),
      status: 'EN_ROUTE',
    }));
  }
}
