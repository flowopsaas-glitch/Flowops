import { Module } from '@nestjs/common';
import { AckService } from './ack.service';
import { AckController } from './ack.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AckController],
  providers: [AckService],
  exports: [AckService], // ✅ THIS IS CRITICAL
})
export class AckModule {}