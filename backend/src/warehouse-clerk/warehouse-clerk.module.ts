import { Module } from '@nestjs/common';
import { WarehouseClerkService } from './warehouse-clerk.service';
import { WarehouseClerkController } from './warehouse-clerk.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WarehouseClerkController],
  providers: [WarehouseClerkService],
  exports: [WarehouseClerkService],
})
export class WarehouseClerkModule {}
