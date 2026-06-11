import { Controller, Get, Post, Body, Res, Param, Query, Logger, ParseIntPipe, Req } from '@nestjs/common';
import { Response } from 'express';
import { BranchesService } from './branches.service';
import { ManifestService } from './manifest.service';

@Controller('branches')
export class BranchesController {
  private readonly logger = new Logger(BranchesController.name);

  constructor(
    private readonly branchesService: BranchesService,
    private readonly manifestService: ManifestService
  ) {}

  @Get('snapshot')
  async getSnapshot() {
    return this.branchesService.getNetworkSnapshot();
  }

  @Post('linehaul')
  async startLinehaul(
    @Body() body: { 
      waybillIds: number[]; 
      destinationBranchId: number; 
      driverId: number; 
      vehicleId?: string; 
    },
    @Req() req: any 
  ) {
    this.logger.log(`Dispatching manifest to driver ${body.driverId}...`);

    // Extracting user ID for commercial auditing
    const currentUserId = req.user?.id;

    return this.branchesService.createLinehaul(
      body.waybillIds, 
      body.destinationBranchId,
      body.driverId,
      body.vehicleId ? Number(body.vehicleId) : undefined,
      currentUserId
    );
  }

  @Get('manifest/:id/pdf')
  async getManifestPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.manifestService.generatePDF(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=manifest-${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('manifests/incoming')
  async getIncoming(@Query('branchId') branchId?: string) {
    return this.branchesService.getIncomingManifests(
      branchId ? Number(branchId) : undefined
    );
  }

  @Post('manifest/:id/receive')
  async receiveManifest(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any
  ) {
    const currentUserId = req.user?.id;
    return this.branchesService.receiveManifest(id, currentUserId);
  }
}
