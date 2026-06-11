import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemOverseerService implements OnModuleInit {
  private readonly logger = new Logger('CLAW_4_OVERSEER');

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Commercial Overseer Active: Monitoring FlowOps Platform Integrity.');
  }

  @Interval(30000) // Every 30 seconds
  async runCommercialIntegrityCheck() {
    this.logger.debug('Running autonomous upgrade sweep...');
    
    await this.auditEmailHubStall();
    await this.verifySecurityCompliance();
  }

  private async auditEmailHubStall() {
    // Proactively find records stuck in "EXTRACTING" for more than 2 minutes
    const stalled = await this.prisma.emailHubItem.findMany({
      where: {
        status: 'EXTRACTING',
        updatedAt: { lt: new Date(Date.now() - 120000) }
      }
    });

    for (const record of stalled) {
      this.logger.warn(`Commercial Alert: Record ${record.id} stalled. Resetting for Claw retry.`);
      await this.prisma.emailHubItem.update({
        where: { id: record.id },
        data: { status: 'NEW', version: { increment: 1 } }
      });
    }
  }

  private async verifySecurityCompliance() {
    // Future logic: Overseer checks if Gmail SMTP App Passwords are valid 
    // and logs an AIEvent if a security upgrade is needed.
  }
}
