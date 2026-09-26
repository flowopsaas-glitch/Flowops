import { Module } from '@nestjs/common';
import { ProcessControlController } from './process-control.controller';
import { ProcessControlService } from './process-control.service';

/**
 * Process Control (Process Book + execution + evidence + improvement).
 *
 * Kept dependency-free apart from PrismaService so the WMS bridge and any
 * future vertical (rail, freight, returns) can import this module without
 * creating cycles.
 */
@Module({
  controllers: [ProcessControlController],
  providers: [ProcessControlService],
  exports: [ProcessControlService],
})
export class ProcessControlModule {}
