import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DispatchController } from './dispatch.controller';
import { AutoDispatchService } from './auto-dispatch.service';
import { LiveTrackingLinkService } from './live-tracking-link.service';

@Module({
  imports: [PrismaModule],
  controllers: [DispatchController],
  providers: [AutoDispatchService, LiveTrackingLinkService],
  exports: [AutoDispatchService, LiveTrackingLinkService],
})
export class DispatchModule {}
