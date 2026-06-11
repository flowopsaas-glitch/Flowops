// src/platform-health/platform-health.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformHealthService } from './platform-health.service';
import { PlatformHealthController } from './platform-health.controller';

@Module({
  imports: [PrismaModule],
  providers: [PlatformHealthService],
  controllers: [PlatformHealthController],
  exports: [PlatformHealthService],
})
export class PlatformHealthModule {}
