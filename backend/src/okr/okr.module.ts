import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OkrController } from './okr.controller';
import { OkrService } from './okr.service';

/**
 * OKR module — FlowOps' own Objectives & Key Results (owner strategic cockpit).
 * Owner-guarded; PrismaService is global. Additive — no impact on tenant data.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OkrController],
  providers: [OkrService],
  exports: [OkrService],
})
export class OkrModule {}
