import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceModule } from '../common/compliance/compliance.module';
import { DispatchController } from './dispatch.controller';
import { AutoDispatchService } from './auto-dispatch.service';
import { LiveTrackingLinkService } from './live-tracking-link.service';
import { FleetDutyService } from './fleet-duty.service';

@Module({
  imports: [PrismaModule, ComplianceModule],
  controllers: [DispatchController],
  providers: [AutoDispatchService, LiveTrackingLinkService, FleetDutyService],
  exports: [AutoDispatchService, LiveTrackingLinkService, FleetDutyService],
})
export class DispatchModule {}
