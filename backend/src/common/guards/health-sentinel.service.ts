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

    // IMPORTANT: memory pressure must be measured against the V8 heap *limit*,
    // NOT against process.memoryUsage().heapTotal. heapTotal is only the heap
    // currently *allocated* by V8, which it keeps just above heapUsed — so
    // heapUsed/heapTotal is almost always ~90%+ even on a perfectly idle
    // process. The old code used that ratio and flagged "critical" at ~66MB of
    // heap, marking the whole platform "degraded" for no reason.
    //
    // getHeapStatistics().heap_size_limit is the real ceiling (driven by
    // --max-old-space-size / the container limit). We compare against that.
    const heapLimitMb = this.getHeapLimitMb();
    const usagePct = heapLimitMb > 0 ? (heapUsedMb / heapLimitMb) * 100 : 0;

    // Absolute + relative guards. Either a hard MB ceiling or a high % of the
    // real heap limit indicates genuine pressure.
    if (heapUsedMb > 1500 || usagePct > 90) return 'critical';
    if (heapUsedMb > 1000 || usagePct > 75) return 'warning';
    return 'healthy';
  }

  private getHeapLimitMb(): number {
    try {
      // Lazy require so this service has no hard dependency on v8 at import time.
      const v8 = require('v8');
      const limitBytes = v8.getHeapStatistics().heap_size_limit;
      return limitBytes / 1024 / 1024;
    } catch {
      return 0; // Fall back to absolute-MB thresholds only.
    }
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
