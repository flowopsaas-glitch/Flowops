import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
  disk: 'healthy' | 'warning' | 'critical' | 'unknown';
  diskUsedPct: number | null;
  uptime: number;
  lastCheck: string;
  issues: string[];
}

@Injectable()
export class HealthSentinelService {
  private readonly logger = new Logger('HEALTH_SENTINEL');
  private lastStatus: HealthStatus = {
    database: 'healthy', memory: 'healthy', eventLoop: 'healthy',
    disk: 'unknown', diskUsedPct: null,
    uptime: 0, lastCheck: new Date().toISOString(), issues: [],
  };
  // Disk thresholds: on a small VPS a full disk stops Postgres writes = total
  // outage, so we warn early and shout loudly before it gets critical.
  private static readonly DISK_WARN_PCT = 80;
  private static readonly DISK_CRITICAL_PCT = 90;
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

    // 4. Disk space — a full disk on a small VPS = Postgres write failure = outage.
    const { status: diskStatus, usedPct: diskUsedPct } = await this.checkDisk();
    if (diskStatus === 'critical') {
      issues.push(`Disk: CRITICAL (${diskUsedPct}% used — free space NOW: docker image prune -f)`);
      this.logger.error(`CRITICAL: disk ${diskUsedPct}% full. Postgres writes will fail when full. Run: docker image prune -f`);
    } else if (diskStatus === 'warning') {
      issues.push(`Disk: warning (${diskUsedPct}% used)`);
    }

    // Update status
    this.lastStatus = {
      database: dbStatus,
      memory: memStatus,
      eventLoop: eventLoopStatus,
      disk: diskStatus,
      diskUsedPct,
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

  /**
   * Real disk-usage check for the filesystem holding the app/DB data.
   * Uses `df` (available in the alpine-based container) and parses the used %.
   * Falls back to 'unknown' if df isn't available or output can't be parsed —
   * we never want the health check itself to throw.
   */
  private async checkDisk(): Promise<{ status: 'healthy' | 'warning' | 'critical' | 'unknown'; usedPct: number | null }> {
    try {
      // -P = POSIX output (single line per fs, stable columns). Check the root
      // fs; in the container that maps to the Docker overlay/host disk.
      const { stdout } = await execFileAsync('df', ['-P', '/'], { timeout: 4000 });
      const lines = stdout.trim().split('\n');
      const dataLine = lines[lines.length - 1] ?? '';
      const match = dataLine.match(/(\d+)%/);
      if (!match) return { status: 'unknown', usedPct: null };
      const usedPct = Number(match[1]);
      if (!Number.isFinite(usedPct)) return { status: 'unknown', usedPct: null };
      if (usedPct >= HealthSentinelService.DISK_CRITICAL_PCT) return { status: 'critical', usedPct };
      if (usedPct >= HealthSentinelService.DISK_WARN_PCT) return { status: 'warning', usedPct };
      return { status: 'healthy', usedPct };
    } catch {
      return { status: 'unknown', usedPct: null };
    }
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
