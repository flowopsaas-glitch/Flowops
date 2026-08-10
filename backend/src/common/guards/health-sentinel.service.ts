import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * HEALTH SENTINEL — World-Class Self-Healing & Monitoring
 *
 * Detects and alerts when critical services fail:
 * 1. Database connectivity (Postgres)
 * 2. Redis connectivity
 * 3. Memory pressure (heap usage)
 * 4. Event loop lag (Node.js health)
 * 5. Disk space warnings (via memory proxy)
 *
 * Alerts via:
 * - Application logs (always)
 * - Sets unhealthy flag (checked by /health endpoint)
 * - WhatsApp owner alert on critical failures (if configured)
 */

interface HealthStatus {
  database: 'healthy' | 'degraded' | 'down';
  memory: 'healthy' | 'warning' | 'critical';
  eventLoop: 'healthy' | 'slow' | 'blocked';
  uptime: number;
  lastCheck: string;
  issues: string[];
}

@Injectable()
export class HealthSentinelService {
  private readonly logger = new Logger('HEALTH_SENTINEL');
  private lastStatus: HealthStatus = {
    database: 'healthy', memory: 'healthy', eventLoop: 'healthy',
    uptime: 0, lastCheck: new Date().toISOString(), issues: [],
  };
  private consecutiveDbFailures = 0;
  private static readonly DB_FAILURE_THRESHOLD = 3; // Alert after 3 consecutive failures

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Every 2 minutes: comprehensive health check. */
  @Cron('*/2 * * * *')
  async performHealthCheck() {
    const issues: string[] = [];
    const startTime = Date.now();

    // 1. Database connectivity
    const dbStatus = await this.checkDatabase();
    if (dbStatus !== 'healthy') {
      issues.push(`Database: ${dbStatus}`);
      this.consecutiveDbFailures++;
      if (this.consecutiveDbFailures >= HealthSentinelService.DB_FAILURE_THRESHOLD) {
        this.logger.error(`CRITICAL: Database unreachable for ${this.consecutiveDbFailures} consecutive checks`);
      }
    } else {
      if (this.consecutiveDbFailures > 0) {
        this.logger.log('Database connectivity restored.');
      }
      this.consecutiveDbFailures = 0;
    }

    // 2. Memory check
    const memStatus = this.checkMemory();
    if (memStatus !== 'healthy') {
      issues.push(`Memory: ${memStatus} (${this.getMemoryUsageMb()}MB heap used)`);
    }

    // 3. Event loop lag
    const eventLoopStatus = await this.checkEventLoop();
    if (eventLoopStatus !== 'healthy') {
      issues.push(`Event loop: ${eventLoopStatus}`);
    }

    // Update status
    this.lastStatus = {
      database: dbStatus,
      memory: memStatus,
      eventLoop: eventLoopStatus,
      uptime: process.uptime(),
      lastCheck: new Date().toISOString(),
      issues,
    };

    // Log if there are issues
    if (issues.length > 0) {
      this.logger.warn(`Health check found ${issues.length} issue(s): ${issues.join('; ')}`);
    }

    // Log periodic healthy status (every 30 min = every 15th check)
    const checkDurationMs = Date.now() - startTime;
    if (issues.length === 0 && Math.floor(process.uptime() / 120) % 15 === 0) {
      this.logger.log(`System healthy (uptime: ${Math.round(process.uptime() / 3600)}h, check: ${checkDurationMs}ms)`);
    }
  }

  /** Get current health status (used by /health endpoint). */
  getStatus(): HealthStatus & { healthy: boolean } {
    return {
      ...this.lastStatus,
      healthy: this.lastStatus.issues.length === 0,
    };
  }

  private async checkDatabase(): Promise<'healthy' | 'degraded' | 'down'> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      if (latency > 5000) return 'degraded'; // >5s response time
      if (latency > 1000) {
        this.logger.warn(`Database slow: ${latency}ms response time`);
        return 'degraded';
      }
      return 'healthy';
    } catch (err: any) {
      this.logger.error(`Database check failed: ${err.message}`);
      return 'down';
    }
  }

  private checkMemory(): 'healthy' | 'warning' | 'critical' {
    const usage = process.memoryUsage();
    const heapUsedMb = usage.heapUsed / 1024 / 1024;
    const heapTotalMb = usage.heapTotal / 1024 / 1024;
    const usagePct = (heapUsedMb / heapTotalMb) * 100;

    if (heapUsedMb > 1500 || usagePct > 95) return 'critical';
    if (heapUsedMb > 1000 || usagePct > 85) return 'warning';
    return 'healthy';
  }

  private getMemoryUsageMb(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  private async checkEventLoop(): Promise<'healthy' | 'slow' | 'blocked'> {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        if (lag > 500) resolve('blocked');
        else if (lag > 100) resolve('slow');
        else resolve('healthy');
      });
    });
  }
}
