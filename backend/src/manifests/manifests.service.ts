import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  private async assertLoadable(companyId: string, waybillIds: string[]) {
    const requireHub = (process.env.MANIFEST_REQUIRE_HUB_RECEIVE ?? 'true') !== 'false';
    if (!requireHub || waybillIds.length === 0) return;

    const wbs = await this.prisma.waybill.findMany({
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

  async create(companyId: string, dto: { waybillIds: string[]; branchId?: string; driverId?: string; destination?: string }) {
    await this.assertLoadable(companyId, dto.waybillIds ?? []);

    const count = await this.prisma.manifest.count({ where: { companyId } });
    const code = `MAN-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.manifest.create({
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
    });
  }

  async update(id: string, companyId: string, dto: any) {
    return this.prisma.manifest.update({ where: { id }, data: dto });
  }

  async receiveManifest(manifestId: string, companyId: string) {
    const manifest = await this.findOne(manifestId, companyId);
    // Mark all waybills as COLLECTED
    const waybillIds = manifest.waybills.map((mw: any) => mw.waybillId);
    await this.prisma.waybill.updateMany({
      where: { id: { in: waybillIds } },
      data: { status: 'COLLECTED' },
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
