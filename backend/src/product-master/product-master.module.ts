import { Module } from '@nestjs/common';
import { ProductMasterController } from './product-master.controller';
import { ProductMasterService } from './product-master.service';

/**
 * Product / Variant / SKU master data. Exported so the WMS receiving flow and
 * the Process Book can resolve governed SKUs instead of free-text strings.
 */
@Module({
  controllers: [ProductMasterController],
  providers: [ProductMasterService],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
