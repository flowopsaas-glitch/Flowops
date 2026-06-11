import { Module } from '@nestjs/common';
import { AckService } from './ack.service';
import { AckController } from './ack.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AckService],
  controllers: [AckController],
  exports: [AckService],
})
export class AcksModule {}
