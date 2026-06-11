import { Controller, Get, Post, Param, Body, Request, ParseIntPipe } from '@nestjs/common';
import { CollectionsService } from './collections.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  async findAll(@Request() req: any) {
    // Ensure the ID is a number for the service call
    const companyId = Number(req.user?.companyId || 1);
    return this.collectionsService.findAll(companyId);
  }

  @Post(':id/assign-driver')
  async assignDriver(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { driverId: number; companyId: any }
  ) {
    // We cast companyId to Number to satisfy the Service's requirements
    return this.collectionsService.assignDriver(
      id, 
      Number(body.driverId), 
      Number(body.companyId)
    );
  }

  @Get(':id/auto-suggest')
  async getSmartSuggestion(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any
  ) {
    const companyId = Number(req.user?.companyId || 1);
    return this.collectionsService.getSmartSuggestion(id, companyId);
  }

  @Post(':id/confirm')
  async confirmCollection(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any
  ) {
    const companyId = Number(req.user?.companyId || 1);
    return this.collectionsService.confirmCollection(id, companyId);
  }
}
