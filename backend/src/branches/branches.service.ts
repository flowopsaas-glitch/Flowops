// @ts-nocheck
// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(private prisma: PrismaService) {}

  private async logActivity(
    type: string, 
    description: string, 
    companyId: number, 
    userId?: number
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          type,
          description, // Fixed: Use description field
          companyId,
          userId,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Activity Log Failed: ${err.message}`);
    }
  }

  async getNetworkSnapshot() {
    const branches = await this.prisma.branch.findMany({
      include: { _count: { select: { inventory: true } } },
    });

    return Promise.all(
      branches.map(async (branch) => {
        const breakdown = await this.prisma.waybill.groupBy({
          by: ['status'],
          where: { currentBranchId: branch.id },
          _count: true,
        });
        return {
          ...branch,
          totalItems: branch._count.inventory,
          statusBreakdown: breakdown,
        };
      })
    );
  }

  async createLinehaul(
    waybillIds: number[],
    destinationBranchId: number,
    driverId: number,
    vehicleId?: number,
    currentUserId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const firstWaybill = await tx.waybill.findUnique({
        where: { id: waybillIds[0] },
      });
      
      if (!firstWaybill?.currentBranchId) {
        throw new Error('Source branch not detected.');
      }

      const manifestNumber = `LH-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const manifest = await tx.linehaulManifest.create({
        data: {
          manifestNumber,
          sourceBranchId: firstWaybill.currentBranchId,
          destinationBranchId: destinationBranchId,
          waybills: { connect: waybillIds.map((id) => ({ id })) },
        },
        include: { sourceBranch: true, destinationBranch: true },
      });

      await tx.waybill.updateMany({
        where: { id: { in: waybillIds } },
        data: { status: WaybillStatus.IN_TRANSIT }
      });

      await this.logActivity(
        'MOVEMENT',
        `Manifest ${manifestNumber} dispatched to ${manifest.destinationBranch?.name} via driver ${driverId}.`,
        firstWaybill.companyId,
        currentUserId
      );

      return manifest;
    });
  }

  async getIncomingManifests(branchId?: number) {
    return this.prisma.linehaulManifest.findMany({
      where: branchId ? { destinationBranchId: branchId } : {},
      include: {
        sourceBranch: true,
        destinationBranch: true,
        _count: { select: { waybills: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async receiveManifest(manifestId: number, currentUserId?: number) {
    const manifest = await this.prisma.linehaulManifest.findUnique({
      where: { id: manifestId },
      include: { waybills: true, destinationBranch: true }
    });

    if (!manifest) throw new NotFoundException('Manifest not found');

    const companyId = manifest.waybills[0]?.companyId;

    return this.prisma.$transaction(async (tx) => {
      await tx.waybill.updateMany({
        where: { linehaulManifestId: manifestId },
        data: {
          currentBranchId: manifest.destinationBranchId,
          status: WaybillStatus.ARRIVED_AT_HUB,
          linehaulManifestId: null,
        },
      });

      if (companyId) {
        await this.logActivity(
          'RECEIPT',
          `Manifest ${manifest.manifestNumber} received at ${manifest.destinationBranch?.name}.`,
          companyId,
          currentUserId
        );
      }

      return tx.linehaulManifest.delete({ where: { id: manifestId } });
    });
  }
}
