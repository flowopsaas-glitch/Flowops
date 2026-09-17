import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';

/**
 * Driver web-push module. Exports PushService so other modules (e.g. shipments/
 * drivers assignment) can call notifyDriver() when a job is assigned.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
