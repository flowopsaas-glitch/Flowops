import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { claimTransition, claimTransitionOf } from '../common/state-transition';

/**
 * Consolidation / co-load: group multiple "house" shipment files under a single
 * "master" file (common for LCL groupage and air co-loads). Additive self-
 * relation on ShipmentFile (master ↔ houseFiles).
 */
@Injectable()
export class ConsolidationService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwned(companyId: string, id: string) {
    const f = await this.prisma.shipmentFile.findFirst({ where: { id, companyId } });
    if (!f) throw new NotFoundException('Shipment file not found');
    return f;
  }

  /** Promote a file to a consolidation master. */
  async markAsMaster(companyId: string, id: string) {
    const f = await this.getOwned(companyId, id);
    // Fast, readable failure for the ordinary mistake. The write below is the
    // one that actually holds: between this check and the update a concurrent
    // attachHouse could link this file under a master, and a file that is both
    // a master and a house is a broken consolidation tree.
    if (f.masterFileId) throw new BadRequestException('A house file cannot also be a master. Detach it first.');
    return claimTransition(
      () =>
        this.prisma.shipmentFile.updateMany({
          where: { id, companyId, masterFileId: null },
          data: { isMaster: true },
        }),
      'That file became a house file while you were promoting it. Nothing was changed.',
    ).then(() => this.getOwned(companyId, id));
  }

  /** Attach a house file to a master. */
  async attachHouse(companyId: string, masterId: string, houseId: string) {
    if (masterId === houseId) throw new BadRequestException('A file cannot be its own master.');
    const master = await this.getOwned(companyId, masterId);
    const house = await this.getOwned(companyId, houseId);

    if (house.isMaster) throw new BadRequestException('That file is itself a master — it cannot become a house.');
    if (house.masterFileId && house.masterFileId !== masterId) {
      throw new BadRequestException('That file is already consolidated under another master.');
    }
    if (master.masterFileId) {
      throw new BadRequestException('That master is itself consolidated under another master.');
    }

    // Both writes land together or not at all: a master flagged with no house
    // attached, or a house linked to an unflagged master, is a half-built
    // consolidation. The WHERE clause on the house is the real guard — it
    // re-checks isMaster and masterFileId at write time, so a concurrent
    // markAsMaster (or a competing attachHouse) loses instead of silently
    // producing a file that is both master and house, or a house under two
    // masters.
    await this.prisma.$transaction(async (tx) => {
      await tx.shipmentFile.updateMany({
        where: { id: masterId, companyId, masterFileId: null },
        data: { isMaster: true },
      });
      await claimTransitionOf(
        () =>
          tx.shipmentFile.updateMany({
            where: {
              id: houseId,
              companyId,
              isMaster: false,
              OR: [{ masterFileId: null }, { masterFileId: masterId }],
            },
            data: { masterFileId: masterId },
          }),
        1,
        'That file changed while you were consolidating it — most likely it was promoted to a master or attached to another master. Nothing was changed.',
      );
    });
    return this.getConsolidation(companyId, masterId);
  }

  /** Remove a house from its master. */
  async detachHouse(companyId: string, masterId: string, houseId: string) {
    await this.getOwned(companyId, masterId);
    await this.prisma.shipmentFile.updateMany({
      where: { id: houseId, companyId, masterFileId: masterId },
      data: { masterFileId: null },
    });
    return this.getConsolidation(companyId, masterId);
  }

  /** Master view: the master + its house files + an aggregated summary. */
  async getConsolidation(companyId: string, masterId: string) {
    const master = await this.prisma.shipmentFile.findFirst({
      where: { id: masterId, companyId },
      include: {
        houseFiles: {
          include: { _count: { select: { containers: true, cargo: true } } },
        },
      },
    });
    if (!master) throw new NotFoundException('Master file not found');

    const houses = (master as any).houseFiles || [];
    const summary = {
      houseCount: houses.length,
      packages: houses.reduce((s: number, h: any) => s + (h.packages || 0), 0),
      grossWeightKg: +houses.reduce((s: number, h: any) => s + (h.grossWeightKg || 0), 0).toFixed(2),
      volumeCbm: +houses.reduce((s: number, h: any) => s + (h.volumeCbm || 0), 0).toFixed(2),
    };
    return { master, houses, summary };
  }

  /** Files that can be attached as houses to the given master (same tenant, free, not masters). */
  async attachableHouses(companyId: string, masterId: string) {
    return this.prisma.shipmentFile.findMany({
      where: {
        companyId,
        id: { not: masterId },
        isMaster: false,
        masterFileId: null,
        status: { notIn: ['CANCELLED', 'DELIVERED'] },
      },
      select: { id: true, fileNumber: true, direction: true, mode: true, consigneeName: true, pod: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
