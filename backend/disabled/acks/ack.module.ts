import { Module } from '@nestjs/common';
import { AckService } from './ack.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AckService],
  exports: [AckService],
})
export class AcksModule {}
