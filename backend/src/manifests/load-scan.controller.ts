import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { LoadScanService } from './load-scan.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadScan: LoadScanService,
  ) {}

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

  // POST /manifests/:id/load-scan/verify — confirm a parcel onto this vehicle.
  //
  // The procedure lives in LoadScanService: what may be loaded, from which
  // states, and how a re-scan differs from a parcel already on another truck.
  // The controller only carries the HTTP shape.
  @Post(':id/load-scan/verify')
  verifyScan(
    @Param('id') id: string,
    @Body() body: { trackingNumber: string },
    @CurrentUser() u: any,
  ) {
    return this.loadScan.verifyScan(u.companyId, id, body.trackingNumber);
  }

  // POST /manifests/:id/load-scan/complete — dispatch the vehicle, list what was never scanned
  @Post(':id/load-scan/complete')
  completeLoad(@Param('id') id: string, @CurrentUser() u: any) {
    return this.loadScan.completeLoad(u.companyId, id);
  }
}
