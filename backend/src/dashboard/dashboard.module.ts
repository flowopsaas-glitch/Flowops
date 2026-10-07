import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { KpiModule } from '../common/kpi/kpi.module';

@Module({
  imports: [KpiModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
