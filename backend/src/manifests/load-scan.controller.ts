import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Route Load & Scan')
@ApiBearerAuth()
@RequireFeature('manifests')
@Roles(
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE,
)
@Controller('manifests')
export class LoadScanController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /manifests/:id/load-scan — get manifest with expected waybills + scanned status
  @Get(':id/load-scan')
  async getLoadScan(@Param('id') id: string, @CurrentUser() u: any) {
    const manifest = await this.prisma.manifest.findFirst({
      where: { id, companyId: u.companyId },
      include: {
        waybills: {
          include: { waybill: { select: { id: true, trackingNumber: true, recipientName: true, recipientAddress: true, weight: true, status: true } } },
        },
        driver: { select: { id: true, name: true, vehicleReg: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!manifest) throw new Error('Manifest not found');
    return manifest;
  }

  // POST /manifests/:id/load-scan/verify — mark a waybill as scanned/verified on the manifest
  @Post(':id/load-scan/verify')
  async verifyScan(
    @Param('id') id: string,
    @Body() body: { trackingNumber: string },
    @CurrentUser() u: any,
  ) {
    // Find the waybill by tracking number in this company
    const waybill = await this.prisma.waybill.findFirst({
      where: { trackingNumber: body.trackingNumber, companyId: u.companyId },
    });
    if (!waybill) return { status: 'NOT_FOUND', trackingNumber: body.trackingNumber };

    // Check if it's on this manifest
    const link = await this.prisma.manifestWaybill.findUnique({
      where: { manifestId_waybillId: { manifestId: id, waybillId: waybill.id } },
    });
    if (!link) return { status: 'NOT_ON_MANIFEST', trackingNumber: body.trackingNumber, waybillId: waybill.id };

    // Update waybill status to IN_TRANSIT (loaded)
    await this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { status: 'IN_TRANSIT' },
    });

    return { status: 'VERIFIED', trackingNumber: body.trackingNumber, waybillId: waybill.id, recipientName: waybill.recipientName };
  }

  // POST /manifests/:id/load-scan/complete — mark loading complete, flag any unscanned
  @Post(':id/load-scan/complete')
  async completeLoad(@Param('id') id: string, @CurrentUser() u: any) {
    const manifest = await this.prisma.manifest.findFirst({
      where: { id, companyId: u.companyId },
      include: { waybills: { include: { waybill: true } } },
    });
    if (!manifest) throw new Error('Manifest not found');

    const loaded = manifest.waybills.filter(mw => mw.waybill.status === 'IN_TRANSIT');
    const unscanned = manifest.waybills.filter(mw => mw.waybill.status !== 'IN_TRANSIT');

    // Mark manifest as dispatched
    await this.prisma.manifest.update({
      where: { id },
      data: { dispatched: true, dispatchedAt: new Date() },
    });

    return {
      manifestId: id,
      totalExpected: manifest.waybills.length,
      loaded: loaded.length,
      unscanned: unscanned.map(mw => ({
        trackingNumber: mw.waybill.trackingNumber,
        recipientName: mw.waybill.recipientName,
      })),
      dispatched: true,
    };
  }
}
