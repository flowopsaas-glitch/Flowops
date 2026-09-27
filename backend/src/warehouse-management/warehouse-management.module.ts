import { Module } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';
import { WarehouseManagementService } from './warehouse-management.service';
import { WarehouseAnalyticsService } from './warehouse-analytics.service';
import { GoodsReceiptProcessBridge } from './goods-receipt-process.bridge';
import { ProcessControlModule } from '../process-control/process-control.module';
import { ProductMasterModule } from '../product-master/product-master.module';

@Module({
  // Process Control + Product Master are imported (not re-exported) so the
  // goods-receipt bridge can drive the WMS.GOODS_RECEIPT standard when the
  // bridge flags are on. Both are inert by default.
  imports: [ProcessControlModule, ProductMasterModule],
  controllers: [WarehouseController],
  providers: [WarehouseManagementService, WarehouseAnalyticsService, GoodsReceiptProcessBridge],
  exports: [WarehouseManagementService, WarehouseAnalyticsService, GoodsReceiptProcessBridge],
})
export class WarehouseManagementModule {}
