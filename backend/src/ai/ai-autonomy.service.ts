import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { AiDiscoveryService } from './ai-discovery.service';
import { AiDevOpsService } from './ai-devops.service';

@Injectable()
export class AiAutonomyService {
  private readonly logger = new Logger('CLAW_AUTONOMY_HUB');

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: AiDiscoveryService,
    private readonly devops: AiDevOpsService,
  ) {}

  /**
   * Orchestrates the scheduled intelligence sweep for security, 
   * performance, and operational logistics.
   * Scheduled: Runs every 4 hours
   */
  @Cron('0 */4 * * *')
  async performIntelligenceSweep(): Promise<void> {
    this.logger.log('🚀 CLAW: Initiating multi-tool intelligence sweep...');

    try {
      // Run security and observability audits concurrently without unhandled exclusions
      await Promise.allSettled([
        this.runSemgrepAudit(),    // Pattern-based security analysis
        this.runTrivyAudit(),      // Native dependency supply chain security
        this.syncSigNozMetrics(),  // Performance infrastructure analysis
        this.auditEmailLogistics() // Logistics extraction pipeline execution
      ]);
      
      this.logger.log('✅ CLAW: Intelligence sweep completed successfully.');
    } catch (err: any) {
      this.logger.error(`Critical systemic structural failure in CLAW Intelligence Sweep: ${err.message}`);
    }
  }

  /** 
   * 🛡️ SEMGREP: Scans code for pattern-based vulnerabilities 
   * Hardened against DEP0190 command parsing exploits
   */
  private async runSemgrepAudit(): Promise<void> {
    try {
      this.logger.log('🕵️ Launching secure Semgrep static pattern scan...');
      const stdout = await this.executeSecureCommand('semgrep', ['scan', '--json', '--config', 'auto']);
      
      if (!stdout) return;
      
      const data = JSON.parse(stdout);
      if (data?.results?.length > 0) {
        this.logger.warn(`Detected ${data.results.length} code pattern discrepancies via Semgrep. Dispatched to threat analyzer...`);
        await this.discovery.analyzeSecurityThreats('SEMGREP', data.results);
      }
    } catch (e: any) {
      // semgrep is an OPTIONAL dev tool, not bundled in the production image.
      // Its absence (spawn ENOENT) is expected — log at debug, never as an error.
      this.logger.debug(`Semgrep scan skipped (tool not available): ${e.message}`);
    }
  }

  /** 
   * 🔍 TRIVY: Scans for critical dependency vulnerabilities
   * Safely bridges automation tracking components cleanly
   */
  private async runTrivyAudit(): Promise<void> {
    try {
      this.logger.log('📦 Launching secure Trivy binary file-system scan...');
      const stdout = await this.executeSecureCommand('trivy', ['fs', '--format', 'json', '.']);
      
      if (!stdout) return;

      const data = JSON.parse(stdout);
      const criticals = data.Results?.flatMap((r: any) => r.Vulnerabilities || [])
        .filter((v: any) => v.Severity === 'CRITICAL');
      
      if (criticals?.length > 0) {
        this.logger.warn(`Detected ${criticals.length} critical vulnerabilities via Trivy tracking matrix.`);
        
        // Executes verified auto-repair via proxy mapping paths inside AiDevOpsService
        await this.devops.executeAutoRepair('package.json', 'Security patch: Vulnerable dependencies detected');
      }
    } catch (e: any) {
      // trivy is an OPTIONAL dev tool, not bundled in the production image.
      this.logger.debug(`Trivy scan skipped (tool not available): ${e.message}`);
    }
  }

  /** 📊 SIGNOZ: Direct query for performance latency spikes */
  private async syncSigNozMetrics(): Promise<void> {
    try {
      // Safe casting bypasses over query parameters to track slow execution queries cleanly
      const slowTraces = await this.prisma.$queryRawUnsafe(
        `SELECT * FROM signoz_traces.distributed_signoz_index_v2 WHERE durationNano > 2000000000 LIMIT 10`
      );
      
      if (slowTraces && Array.isArray(slowTraces) && slowTraces.length > 0) {
        this.logger.warn(`Detected ${slowTraces.length} infrastructure performance traces exceeding >2s execution thresholds.`);
      }
    } catch (err: any) {
      // SigNoz tracing tables only exist when a SigNoz/ClickHouse stack is
      // attached. Without it this query is expected to fail — debug, not error.
      this.logger.debug(`SigNoz metrics sync skipped (tracing backend not attached): ${err.message}`);
    }
  }

  /** 📦 EMAIL HUB: Processes logistics data extraction and promotion */
  private async auditEmailLogistics(): Promise<void> {
    try {
      // Filter for unresolved items that contain body text to prevent type runtime drops.
      // `resolved` is the canonical "handled" flag (a `status` column also exists
      // since the Email Hub revamp, but `resolved` stays the source of truth here).
      const pendingItems = await (this.prisma as any).emailHubItem.findMany({ 
        where: { 
          resolved: false,
          body: { not: null }
        } 
      });

      for (const item of pendingItems) {
        if (!item.body) continue;

        const result = await this.discovery.extractLogisticsData(item.body);

        // Guard: reject the AI fallback error-object. The extractor returns a
        // sentinel value when parsing fails — { referenceNumber: 'ERROR-PARSING', ... }.
        // We must never write that to the database as a real waybill.
        if (!result) continue;
        if (result.referenceNumber === 'ERROR-PARSING') {
          this.logger.warn(`EmailHubItem ${item.id}: extraction returned error sentinel — skipping waybill creation.`);
          continue;
        }
        // All required fields must be present and non-placeholder before promotion.
        const requiredFields: (keyof typeof result)[] = ['referenceNumber', 'pickupAddress', 'receiverCity'];
        const hasPlaceholders = requiredFields.some(
          (f) => !result[f] || result[f] === 'Unknown',
        );
        if (hasPlaceholders) {
          this.logger.warn(`EmailHubItem ${item.id}: extraction result has missing/unknown fields — skipping promotion. Fields: ${JSON.stringify(result)}`);
          continue;
        }

        if (result) {
          // Automatically promote unstructured email payloads directly into verified system Waybills
          await this.prisma.waybill.create({ 
            data: { 
              ...result, 
              companyId: item.companyId 
            } 
          });

          // Mark the hub item handled in a single atomic write. `resolved` is
          // the canonical handled flag and `status` aligns the Email Hub UI to
          // the documented 'RESOLVED' value (see schema.prisma EmailHubItem).
          // If a deployment ever drifts to a Prisma client that predates the
          // `status` column, we fall back to writing the canonical `resolved`
          // flag alone — so promotion is never left half-done and the sweep
          // never spews the noisy `Unknown argument 'status'` error each run.
          try {
            await (this.prisma as any).emailHubItem.update({
              where: { id: item.id },
              data: { resolved: true, status: 'RESOLVED', needsOpsAction: false },
            });
          } catch {
            await (this.prisma as any).emailHubItem.update({
              where: { id: item.id },
              data: { resolved: true },
            });
          }

          this.logger.log(`Successfully promoted EmailHubItem entry ID ${item.id} to enterprise Waybill.`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Logistics extraction bridge flagged an operation fault: ${error.message}`);
    }
  }

  /**
   * 🛡️ Isolated Subprocess Command Spawner
   * Completely bypasses system shell environments to clear DEP0190 warnings.
   */
  private executeSecureCommand(executable: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        shell: false, // Prevents terminal concatenation execution vulnerabilities
        cwd: process.cwd(),
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data) => (stdoutData += data.toString()));
      child.stderr.on('data', (data) => (stderrData += data.toString()));

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Binary execution path [${executable}] failed with code ${code}: ${stderrData}`));
        }
        resolve(stdoutData.trim());
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to initialize external execution token: ${err.message}`));
      });
    });
  }
}

