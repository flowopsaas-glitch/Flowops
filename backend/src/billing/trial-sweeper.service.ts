import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrialSweeperService {
  private readonly logger = new Logger(TrialSweeperService.name);

  constructor(private prisma: PrismaService) {}

  // This runs every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleTrialExpirations() {
    this.logger.log('--- STARTING DAILY TRIAL EXPIRATION SWEEP ---');

    const now = new Date();

    const expiredTenants = await this.prisma.company.updateMany({
      where: {
        plan: 'STARTER',
        status: 'Trialing',
        trialEndsAt: {
          lt: now, // "Less than" now
        },
      },
      data: {
        status: 'Locked',
      },
    });

    if (expiredTenants.count > 0) {
      this.logger.warn(`Successfully locked ${expiredTenants.count} expired trial accounts.`);
    } else {
      this.logger.log('No expired trials found today.');
    }
    
    this.logger.log('--- SWEEP COMPLETE ---');
  }
}
