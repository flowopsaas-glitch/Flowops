import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CourierManagementController } from './courier-management.controller';
import { CourierManagementService } from './courier-management.service';

/**
 * Courier Management Suite (Enterprise). BillingService is @Global for the
 * courierManagement entitlement gate.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CourierManagementController],
  providers: [CourierManagementService],
  exports: [CourierManagementService],
})
export class CourierManagementModule {}
