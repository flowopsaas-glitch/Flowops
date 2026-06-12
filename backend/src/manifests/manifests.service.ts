import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(companyId: string, dto: { waybillIds: string[]; branchId?: string; driverId?: string; destination?: string }) {
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
}
