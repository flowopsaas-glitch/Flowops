import { Module } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';
import { WarehouseManagementService } from './warehouse-management.service';
import { WarehouseAnalyticsService } from './warehouse-analytics.service';

@Module({
  controllers: [WarehouseController],
  providers: [WarehouseManagementService, WarehouseAnalyticsService],
  exports: [WarehouseManagementService, WarehouseAnalyticsService],
})
export class WarehouseManagementModule {}
