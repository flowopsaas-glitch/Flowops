import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { WaybillsController } from './waybills.controller';
import { WaybillsService } from './waybills.service';
import { LabelService } from './label.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EcommerceModule } from '../ecommerce/ecommerce.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ComplianceModule } from '../common/compliance/compliance.module';

@Module({
  imports: [ComplianceModule,
    MulterModule.register({ storage: memoryStorage() }),
    NotificationsModule,
    EcommerceModule,
    GatewayModule,
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService, LabelService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
