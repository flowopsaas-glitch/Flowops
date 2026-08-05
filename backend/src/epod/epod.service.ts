import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureEpodDto, VerifyEpodDto, DisputeEpodDto } from './dto/epod.dto';

@Injectable()
export class EpodService {
  constructor(private readonly prisma: PrismaService) {}

  async capture(companyId: string, dto: CaptureEpodDto) {
    // Check waybill exists
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, companyId },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    const epod = await this.prisma.electronicPod.create({
      data: {
        companyId,
        waybillId: dto.waybillId,
        driverId: dto.driverId,
        status: 'CAPTURED',
        signatureUrl: dto.signatureUrl,
        photoUrls: dto.photoUrls || [],
        recipientName: dto.recipientName,
        recipientId: dto.recipientId,
        notes: dto.notes,
        geoLat: dto.geoLat,
        geoLng: dto.geoLng,
        capturedAt: new Date(),
      },
    });

    // Update waybill status to DELIVERED
    await this.prisma.waybill.update({
      where: { id: dto.waybillId },
      data: { status: 'DELIVERED' },
    });

    return epod;
  }

  async findAll(companyId: string, query?: { status?: string; waybillId?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.waybillId) where.waybillId = query.waybillId;

    return this.prisma.electronicPod.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const epod = await this.prisma.electronicPod.findFirst({ where: { id, companyId } });
    if (!epod) throw new NotFoundException('ePOD not found');
    return epod;
  }

  async findByWaybill(waybillId: string, companyId: string) {
    return this.prisma.electronicPod.findFirst({
      where: { waybillId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async verify(id: string, companyId: string, dto: VerifyEpodDto) {
    const epod = await this.findOne(id, companyId);
    if (epod.status !== 'CAPTURED') {
      throw new BadRequestException('Only captured ePODs can be verified');
    }
    return this.prisma.electronicPod.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedBy: dto.verifiedBy, verifiedAt: new Date() },
    });
  }

  async dispute(id: string, companyId: string, dto: DisputeEpodDto) {
    const epod = await this.findOne(id, companyId);
    if (epod.status === 'DISPUTED') {
      throw new BadRequestException('ePOD is already disputed');
    }
    return this.prisma.electronicPod.update({
      where: { id },
      data: { status: 'DISPUTED', disputeReason: dto.reason },
    });
  }

  async getStats(companyId: string) {
    const [total, captured, verified, disputed] = await Promise.all([
      this.prisma.electronicPod.count({ where: { companyId } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'CAPTURED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'VERIFIED' } }),
      this.prisma.electronicPod.count({ where: { companyId, status: 'DISPUTED' } }),
    ]);
    return { total, captured, verified, disputed, verificationRate: total ? Math.round((verified / total) * 100) : 0 };
  }
}
