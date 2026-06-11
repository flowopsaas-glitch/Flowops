import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardGateway } from './dashboard.gateway'; // 🚀 Import the Gateway
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardGateway // 🚀 Register the gateway to activate the Socket server port!
  ],
  exports: [DashboardService, DashboardGateway],
})
export class DashboardModule {}

