import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { ObservabilityService } from './observability.service';
import { ObservabilityController } from './observability.controller';
import { ObservabilityInterceptor } from './observability.interceptor';

/**
 * CLAW Observatory — self-hosted error intelligence. @Global so the owner
 * console controller can inject ObservabilityService, and the capture
 * interceptor is registered app-wide.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController],
  providers: [
    ObservabilityService,
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
  ],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
