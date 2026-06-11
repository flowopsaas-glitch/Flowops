// src/platform-health/platform-health.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as os from 'os';

export interface HealthMetric {
  name: string;
  value: number;
  unit: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  threshold: { warn: number; critical: number };
}

export interface HealthRecommendation {
  id: string;
  category: 'PERFORMANCE' | 'SECURITY' | 'SCALABILITY' | 'RELIABILITY' | 'FEATURE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  action: string;
  autoDetected: boolean;
  createdAt: Date;
}

export interface PlatformHealthStatus {
  overallScore: number;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  metrics: HealthMetric[];
  recommendations: HealthRecommendation[];
  systemInfo: {
    uptime: number;
    nodeVersion: string;
    platform: string;
    cpuCores: number;
    totalMemoryMB: number;
    freeMemoryMB: number;
    loadAverage: number[];
  };
  database: {
    connected: boolean;
    responseTimeMs: number;
    totalCompanies: number;
    totalUsers: number;
    totalWaybills: number;
  };
  lastCheckAt: string;
}

@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger('PlatformHealth');
  private healthStatus: PlatformHealthStatus | null = null;
  private recommendations: HealthRecommendation[] = [];
  private lastCheckAt: Date | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CRON: Runs every 5 minutes to check platform health
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES)
  async performHealthCheck() {
    this.logger.debug('🏥 Platform Health: Running health check...');

    try {
      const metrics: HealthMetric[] = [];
      const recommendations: HealthRecommendation[] = [];
      const now = new Date();

      // ── 1. Memory Usage ─────────────────────────────────────────────────
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
      metrics.push({
        name: 'Memory Usage',
        value: memUsagePercent,
        unit: '%',
        status: memUsagePercent > 90 ? 'CRITICAL' : memUsagePercent > 75 ? 'DEGRADED' : 'HEALTHY',
        threshold: { warn: 75, critical: 90 },
      });

      if (memUsagePercent > 75) {
        recommendations.push({
          id: `mem-${now.getTime()}`,
          category: 'PERFORMANCE',
          severity: memUsagePercent > 90 ? 'HIGH' : 'MEDIUM',
          title: 'High Memory Usage Detected',
          description: `Server memory usage is at ${memUsagePercent}%. This can cause slowdowns and crashes.`,
          action: 'Consider increasing server RAM or optimizing memory-heavy operations (e.g., batch processing, image handling).',
          autoDetected: true,
          createdAt: now,
        });
      }

      // ── 2. CPU Load ─────────────────────────────────────────────────────
      const loadAvg = os.loadavg();
      const cpuCores = os.cpus().length;
      const cpuLoadPercent = Math.round((loadAvg[0] / cpuCores) * 100);
      metrics.push({
        name: 'CPU Load',
        value: cpuLoadPercent,
        unit: '%',
        status: cpuLoadPercent > 85 ? 'CRITICAL' : cpuLoadPercent > 60 ? 'DEGRADED' : 'HEALTHY',
        threshold: { warn: 60, critical: 85 },
      });

      if (cpuLoadPercent > 60) {
        recommendations.push({
          id: `cpu-${now.getTime()}`,
          category: 'SCALABILITY',
          severity: cpuLoadPercent > 85 ? 'HIGH' : 'MEDIUM',
          title: 'High CPU Load',
          description: `CPU load average is ${loadAvg[0].toFixed(2)} across ${cpuCores} cores (${cpuLoadPercent}% normalized).`,
          action: 'Review cron job frequency, optimize database queries, or scale horizontally with load balancing.',
          autoDetected: true,
          createdAt: now,
        });
      }

      // ── 3. Database Response Time ───────────────────────────────────────
      const dbStart = Date.now();
      let dbConnected = false;
      let totalCompanies = 0;
      let totalUsers = 0;
      let totalWaybills = 0;

      try {
        await this.prisma.$queryRaw`SELECT 1`;
        dbConnected = true;
        [totalCompanies, totalUsers, totalWaybills] = await Promise.all([
          this.prisma.company.count(),
          this.prisma.user.count(),
          this.prisma.waybill.count().catch(() => 0),
        ]);
      } catch (e) {
        dbConnected = false;
      }
      const dbResponseMs = Date.now() - dbStart;

      metrics.push({
        name: 'Database Response',
        value: dbResponseMs,
        unit: 'ms',
        status: !dbConnected ? 'CRITICAL' : dbResponseMs > 500 ? 'DEGRADED' : 'HEALTHY',
        threshold: { warn: 200, critical: 500 },
      });

      if (!dbConnected) {
        recommendations.push({
          id: `db-conn-${now.getTime()}`,
          category: 'RELIABILITY',
          severity: 'HIGH',
          title: 'Database Connection Failed',
          description: 'Unable to connect to the PostgreSQL database.',
          action: 'Check DATABASE_URL in .env, verify PostgreSQL is running, check connection pool limits.',
          autoDetected: true,
          createdAt: now,
        });
      } else if (dbResponseMs > 200) {
        recommendations.push({
          id: `db-slow-${now.getTime()}`,
          category: 'PERFORMANCE',
          severity: dbResponseMs > 500 ? 'HIGH' : 'MEDIUM',
          title: 'Slow Database Queries',
          description: `Database response time is ${dbResponseMs}ms (target: <200ms).`,
          action: 'Add indexes on frequently queried columns, enable connection pooling (PgBouncer), or optimize N+1 queries.',
          autoDetected: true,
          createdAt: now,
        });
      }

      // ── 4. Process Uptime ───────────────────────────────────────────────
      const uptimeHours = Math.round(process.uptime() / 3600);
      metrics.push({
        name: 'Process Uptime',
        value: uptimeHours,
        unit: 'hours',
        status: uptimeHours < 1 ? 'DEGRADED' : 'HEALTHY',
        threshold: { warn: 1, critical: 0 },
      });

      // ── 5. Disk Usage (approximate via os) ──────────────────────────────
      // Node doesn't have native disk usage, so we estimate from memory patterns
      const heapUsed = process.memoryUsage().heapUsed;
      const heapTotal = process.memoryUsage().heapTotal;
      const heapPercent = Math.round((heapUsed / heapTotal) * 100);
      metrics.push({
        name: 'Heap Usage',
        value: heapPercent,
        unit: '%',
        status: heapPercent > 90 ? 'CRITICAL' : heapPercent > 70 ? 'DEGRADED' : 'HEALTHY',
        threshold: { warn: 70, critical: 90 },
      });

      // ── 6. AI-Generated Platform Recommendations ────────────────────────
      // These are rule-based "AI" recommendations based on data patterns

      if (totalUsers === 0) {
        recommendations.push({
          id: `no-users-${now.getTime()}`,
          category: 'FEATURE',
          severity: 'MEDIUM',
          title: 'No Tenant Users Registered',
          description: 'The platform has no regular users beyond the super admin.',
          action: 'Seed demo users or enable the self-signup feature to onboard tenants.',
          autoDetected: true,
          createdAt: now,
        });
      }

      if (totalCompanies <= 1) {
        recommendations.push({
          id: `single-tenant-${now.getTime()}`,
          category: 'SCALABILITY',
          severity: 'LOW',
          title: 'Single Tenant Mode',
          description: 'Only one company exists. Platform multi-tenancy is underutilized.',
          action: 'Add demo tenants to test isolation, or begin onboarding real customers.',
          autoDetected: true,
          createdAt: now,
        });
      }

      // Security recommendations
      recommendations.push({
        id: `security-headers-${now.getTime()}`,
        category: 'SECURITY',
        severity: 'LOW',
        title: 'Review Security Headers',
        description: 'Ensure CORS, CSP, and rate limiting are configured for production.',
        action: 'Add helmet middleware, configure strict CORS origins, and verify throttler settings.',
        autoDetected: true,
        createdAt: now,
      });

      // ── Calculate overall score ─────────────────────────────────────────
      const criticalCount = metrics.filter(m => m.status === 'CRITICAL').length;
      const degradedCount = metrics.filter(m => m.status === 'DEGRADED').length;
      const healthyCount = metrics.filter(m => m.status === 'HEALTHY').length;

      let overallScore = 100;
      overallScore -= criticalCount * 25;
      overallScore -= degradedCount * 10;
      overallScore = Math.max(0, Math.min(100, overallScore));

      const overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' =
        criticalCount > 0 ? 'CRITICAL' : degradedCount > 1 ? 'DEGRADED' : 'HEALTHY';

      // ── Store results ───────────────────────────────────────────────────
      this.recommendations = recommendations;
      this.lastCheckAt = now;
      this.healthStatus = {
        overallScore,
        overallStatus,
        metrics,
        recommendations,
        systemInfo: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          cpuCores: cpuCores,
          totalMemoryMB: Math.round(totalMem / 1024 / 1024),
          freeMemoryMB: Math.round(freeMem / 1024 / 1024),
          loadAverage: loadAvg.map(l => Math.round(l * 100) / 100),
        },
        database: {
          connected: dbConnected,
          responseTimeMs: dbResponseMs,
          totalCompanies,
          totalUsers,
          totalWaybills,
        },
        lastCheckAt: now.toISOString(),
      };

      this.logger.log(
        `✅ Platform Health: Score ${overallScore}% (${overallStatus}) | ` +
        `${metrics.length} metrics, ${recommendations.length} recommendations`
      );
    } catch (error: any) {
      this.logger.error(`❌ Platform health check failed: ${error?.message}`, error?.stack);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  getHealthStatus(): PlatformHealthStatus | { message: string } {
    if (!this.healthStatus) {
      return { message: 'Health check has not run yet. Trigger a manual check or wait for the next scheduled run.' };
    }
    return this.healthStatus;
  }

  getRecommendations(category?: string): HealthRecommendation[] {
    if (category) {
      return this.recommendations.filter(r => r.category === category.toUpperCase());
    }
    return this.recommendations;
  }

  async triggerManualCheck() {
    await this.performHealthCheck();
    return {
      message: 'Health check completed',
      score: this.healthStatus?.overallScore,
      status: this.healthStatus?.overallStatus,
      metricsCount: this.healthStatus?.metrics.length,
      recommendationsCount: this.recommendations.length,
      lastCheckAt: this.lastCheckAt?.toISOString(),
    };
  }
}
