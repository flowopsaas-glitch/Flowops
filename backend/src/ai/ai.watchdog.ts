import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiWatchdog {
  private readonly logger = new Logger('AI_WATCHDOG');

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutomaticHealing(): Promise<void> {
    this.logger.log('🐕 AI Watchdog: Running hourly health check...');
    
    try {
      const health = await this.checkSystemHealth();
      
      if (health.issues.length > 0) {
        this.logger.warn(`⚠️ Watchdog found ${health.issues.length} issues`);
        await this.sendAlert(health.issues);
      } else {
        this.logger.log('✅ System health: All clear');
      }
    } catch (error: any) {
      this.logger.error(`Watchdog error: ${error.message}`);
    }
  }

  private async checkSystemHealth(): Promise<{ issues: string[]; status: string }> {
    const issues: string[] = [];
    
    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Check for stuck waybills (in transit for more than 24h)
      const stuckWaybills = await this.prisma.waybill.count({
        where: {
          status: 'IN_TRANSIT',
          updatedAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });
      
      if (stuckWaybills > 0) {
        issues.push(`${stuckWaybills} waybills stuck in transit for >24h`);
      }
      
      // Check for failed deliveries
      const failedDeliveries = await this.prisma.waybill.count({
        where: {
          status: 'FAILED',
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });
      
      if (failedDeliveries > 5) {
        issues.push(`${failedDeliveries} failed deliveries in last 24h`);
      }
      
    } catch (error: any) {
      issues.push(`Health check error: ${error.message}`);
    }
    
    return {
      issues,
      status: issues.length === 0 ? 'healthy' : 'degraded',
    };
  }

  private async sendAlert(issues: string[]): Promise<void> {
    this.logger.warn(`🚨 ALERT: ${issues.join(', ')}`);
    // In production, send to admin via WhatsApp/email
  }
}
