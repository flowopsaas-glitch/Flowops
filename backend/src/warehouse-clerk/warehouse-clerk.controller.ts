import { 
  Controller, Get, Post, Body, Param, Query, 
  UseGuards, Request, ParseIntPipe 
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WarehouseClerkService } from './warehouse-clerk.service';

@UseGuards(JwtAuthGuard)
@Controller('warehouse-clerk')
export class WarehouseClerkController {
  constructor(private readonly service: WarehouseClerkService) {}

  @Get('overview/:warehouseId')
  async getOverview(
    @Request() req: any,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    return this.service.getWarehouseOverview(warehouseId, req.user.companyId);
  }

  @Post('check-in')
  async checkIn(@Request() req: any, @Body() body: any) {
    return this.service.checkInParcel({
      ...body,
      companyId: req.user.companyId,
      clerkId: req.user.id,
    });
  }

  @Post('check-out')
  async checkOut(@Request() req: any, @Body() body: any) {
    return this.service.checkOutParcel({
      ...body,
      companyId: req.user.companyId,
      clerkId: req.user.id,
    });
  }

  @Get('search/:warehouseId')
  async search(
    @Request() req: any,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Query('q') query: string = '',
  ) {
    return this.service.searchParcels(warehouseId, req.user.companyId, query);
  }

  @Get('collection-queue/:warehouseId')
  async getCollectionQueue(
    @Request() req: any,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    return this.service.getParcelsForCollection(warehouseId, req.user.companyId);
  }

  @Get('recent/:warehouseId')
  async getRecent(
    @Request() req: any,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Query('limit') limit: number = 20,
  ) {
    return this.service.getRecentParcels(warehouseId, req.user.companyId, limit);
  }
}
