import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

/**
 * Demurrage / detention tracking. Per container: a free-days window from an
 * availability date; once exceeded, a per-diem accrues until the empty is
 * returned. Surfaces the accruing cost + a risk flag so operators act before
 * charges balloon.
 */
@Injectable()
export class DemurrageService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFile(companyId: string, fileId: string) {
    const f = await this.prisma.shipmentFile.findFirst({ where: { id: fileId, companyId }, select: { id: true } });
    if (!f) throw new NotFoundException('Shipment file not found');
  }

  async setTerms(
    companyId: string,
    fileId: string,
    containerId: string,
    dto: { freeDays?: number; perDiemRate?: number; availableFrom?: string | null; returnedAt?: string | null },
  ) {
    await this.assertFile(companyId, fileId);
    const data: any = {};
    if (dto.freeDays !== undefined) data.freeDays = dto.freeDays;
    if (dto.perDiemRate !== undefined) data.perDiemRate = dto.perDiemRate;
    if (dto.availableFrom !== undefined) data.availableFrom = dto.availableFrom ? new Date(dto.availableFrom) : null;
    if (dto.returnedAt !== undefined) data.returnedAt = dto.returnedAt ? new Date(dto.returnedAt) : null;
    await this.prisma.shipmentContainer.updateMany({ where: { id: containerId, fileId }, data });
    return this.prisma.shipmentContainer.findFirst({ where: { id: containerId, fileId } });
  }

  /** Compute accruing demurrage/detention per container + file totals. */
  async calcForFile(companyId: string, fileId: string) {
    await this.assertFile(companyId, fileId);
    const containers = await this.prisma.shipmentContainer.findMany({ where: { fileId } });
    const now = Date.now();

    const lines = containers.map((c) => {
      const freeDays = c.freeDays ?? 0;
      const rate = c.perDiemRate ?? 0;
      if (!c.availableFrom || rate <= 0) {
        return { containerId: c.id, containerNo: c.containerNo, daysUsed: 0, chargeableDays: 0, charge: 0, open: false };
      }
      const end = c.returnedAt ? new Date(c.returnedAt).getTime() : now;
      const daysUsed = Math.max(0, Math.ceil((end - new Date(c.availableFrom).getTime()) / DAY_MS));
      const chargeableDays = Math.max(0, daysUsed - freeDays);
      const charge = +(chargeableDays * rate).toFixed(2);
      return {
        containerId: c.id, containerNo: c.containerNo,
        freeDays, perDiemRate: rate, daysUsed, chargeableDays, charge,
        daysToFree: Math.max(0, freeDays - daysUsed),
        open: !c.returnedAt, // still accruing
      };
    });

    const totalCharge = +lines.reduce((s, l) => s + l.charge, 0).toFixed(2);
    const accruing = lines.some((l) => l.open && l.chargeableDays > 0);
    const nearLimit = lines.some((l) => l.open && l.charge === 0 && (l as any).daysToFree <= 2 && (l as any).daysToFree >= 0 && l.perDiemRate);

    return {
      lines,
      totalCharge,
      accruing,
      nearLimit,
      riskLevel: accruing ? 'high' : nearLimit ? 'medium' : 'low',
    };
  }
}
