import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SlaService } from './sla.service';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),        // initializes NestJS scheduler
    forwardRef(() => DispatchModule) // in case SLA needs to access dispatches
  ],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}