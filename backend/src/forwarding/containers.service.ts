import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { checkContainerNumber } from './container-check-digit';

@Injectable()
export class ContainersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ensure the file exists and belongs to this tenant. */
  private async assertFile(companyId: string, fileId: string) {
    const f = await this.prisma.shipmentFile.findFirst({ where: { id: fileId, companyId }, select: { id: true } });
    if (!f) throw new NotFoundException('Shipment file not found');
  }

  async addContainer(
    companyId: string,
    fileId: string,
    dto: { containerNo: string; isoType: string; sealNo?: string; vgmKg?: number },
  ) {
    await this.assertFile(companyId, fileId);
    const check = checkContainerNumber(dto.containerNo);
    const created = await this.prisma.shipmentContainer.create({
      data: {
        fileId,
        containerNo: check.normalized || dto.containerNo,
        isoType: dto.isoType,
        sealNo: dto.sealNo ?? null,
        vgmKg: dto.vgmKg ?? null,
      },
    });
    // Warn (don't block) on a failed check digit — operators often paste from docs.
    return { ...created, checkDigitValid: check.checkDigitValid, wellFormed: check.wellFormed };
  }

  async removeContainer(companyId: string, fileId: string, containerId: string) {
    await this.assertFile(companyId, fileId);
    await this.prisma.shipmentContainer.deleteMany({ where: { id: containerId, fileId } });
    return { deleted: true };
  }

  async addCargo(
    companyId: string,
    fileId: string,
    dto: { description: string; pieces?: number; weightKg?: number; dimensions?: string; hsCode?: string; customsValue?: number },
  ) {
    await this.assertFile(companyId, fileId);
    return this.prisma.cargoLine.create({
      data: {
        fileId,
        description: dto.description,
        pieces: dto.pieces ?? null,
        weightKg: dto.weightKg ?? null,
        dimensions: dto.dimensions ?? null,
        hsCode: dto.hsCode ?? null,
        customsValue: dto.customsValue ?? null,
      },
    });
  }

  async removeCargo(companyId: string, fileId: string, cargoId: string) {
    await this.assertFile(companyId, fileId);
    await this.prisma.cargoLine.deleteMany({ where: { id: cargoId, fileId } });
    return { deleted: true };
  }
}
