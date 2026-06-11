import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommercialOverseerService {
  private readonly logger = new Logger('CLAW_4_OVERSEER');

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleAutonomousUpgrade() {
    this.logger.log('Commercial Overseer Active: Monitoring FlowOps Platform Integrity.');
    
    // Check for platform improvements
    await this.checkPlatformHealth();
  }

  private async checkPlatformHealth() {
    try {
      // Check system metrics
      const waybillCount = await this.prisma.waybill.count();
      const activeTenants = await this.prisma.company.count({ where: { isActive: true } });
      
      this.logger.log(`Platform Health: ${waybillCount} waybills, ${activeTenants} active tenants`);
    } catch (error: any) {
      this.logger.error(`Health check failed: ${error.message}`);
    }
  }

  async getBillingInsights(companyId: number): Promise<any> {
    const batches = await this.prisma.billingBatch.findMany({
      where: { companyId },
      include: { waybills: true }
    });

    return {
      totalBatches: batches.length,
      totalRevenue: batches.reduce((sum, b) => sum + (b.total || 0), 0),
      companyId
    };
  }
}
