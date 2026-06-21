import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { spawn } from 'child_process';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AiDevOpsService {
  private readonly logger = new Logger(AiDevOpsService.name);
  private readonly backupDirectory = path.join(process.cwd(), 'storage', 'snapshots', 'code-recovery');

  constructor(
    @Inject(forwardRef(() => AiService))
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Evaluates the external logistics landscape and self-injects features.
   */
  async learnAndEvolve(companyId: number): Promise<string[]> {
    this.logger.log('🌐 [CLAW EVOLUTION] Initiating South African Market Research Pass...');
    const researchQuery = "Identify unique logistics features missing in the South African (ZAR) gig economy.";
    
    try {
      const innovations = await this.aiService.analyzeMarketGaps(researchQuery);
      this.logger.log(`✨ [CLAW EVOLUTION] Discovered upgrades: ${innovations.join(', ')}`);

      for (const feature of innovations) {
        await this.injectCompetitiveFeature(companyId, feature);
      }
      return innovations;
    } catch (error: any) {
      this.logger.error(`❌ [CLAW EVOLUTION] Evolution loop failed: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Safely registers code optimizations or features within the persistent data store.
   */
  private async injectCompetitiveFeature(companyId: number, featureName: string): Promise<any> {
    this.logger.warn(`🚀 [CLAW EVOLUTION] Deploying self-developed operational feature node: ${featureName}...`);
    try {
      if ((this.prisma as any).companyActivityLog) {
        return await (this.prisma as any).companyActivityLog.create({
          data: {
            companyId,
            type: 'AI_EVOLUTION',
            description: `Self-deployed feature node: ${featureName}`,
            createdAt: new Date()
          }
        });
      }
      return await this.prisma.company.update({
        where: { id: String(companyId) },
        data: { isActive: true }
      });
    } catch (dbErr: any) {
      this.logger.error(`Failed to record feature injection parameters in history logs: ${dbErr.message}`);
    }
  }
     /**
   * 🔄 Compatibility Proxy Alias
   * Routes legacy orchestrator execution triggers from AiAutonomyService cleanly to the unified self-healing engine.
   */
  async executeAutoRepair(fileName: string, context?: string): Promise<{ repaired: boolean; file: string; branch: string | null; pushedUpstream: boolean; processedAt: string }> {
    this.logger.log(`🔄 [PROXY_REDIRECT] Forwarding legacy auto-repair invocation to verified script restoration core engine...`);
    return this.repairScript(fileName, context);
  }

  /**
   * Directly addresses script anomalies caught during runtime crashes or watchdog surveys.
   */
  async repairScript(fileName: string, context?: string): Promise<{ 
    repaired: boolean; 
    file: string; 
    branch: string | null; 
    pushedUpstream: boolean; 
    processedAt: string; 
  }> {
    this.logger.warn(`🔧 [SELF_REPAIR] Executing script recovery block sequence for target: ${fileName}`);
    
    const resolutionTimestamp = new Date().toISOString();
    const sourceFilePath = this.resolveWorkspaceFilePath(fileName);
    const targetBranch = `claw-fix/${path.basename(fileName, path.extname(fileName))}-${Date.now()}`;
    let initialBranchName = 'main';
    let pushedUpstream = false;

    try {
      // 1. Fetch current repository head context
      initialBranchName = await this.executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
      
      // 2. Checkout clean feature branch environment
      this.logger.log(`🌿 [GIT_ISOLATION] Spawning target repair feature branch: ${targetBranch}`);
      await this.executeGitCommand(['checkout', '-b', targetBranch]);

      // 3. Rollback Backup Phase: Capture a baseline snapshot copy locally
      await this.createFileRollbackSnapshot(sourceFilePath, fileName);

      // 4. Mutation Execution Phase: Inject patch corrections
      if (context === "UI_BLANK_PAGE_DETECTED" && fileName.endsWith('.tsx')) {
        const recoveredUiBoilerplate = `import React from 'react';\n\nexport default function AiClawChat() {\n  return <div className="p-4 text-white font-mono bg-slate-950 border border-sky-500/30 rounded-2xl">System Reset Complete. Interface operational.</div>;\n}`;
        await fs.writeFile(sourceFilePath, recoveredUiBoilerplate, 'utf8');
      } else if (context) {
        await fs.writeFile(sourceFilePath, context, 'utf8');
      }

      // 5. Inject Automatic Formatting Corrections (--fix)
      this.logger.log(`🧹 [AUTO_FORMAT] Running lint optimizations to correct spacing or syntax stylings...`);
      try {
        await this.runSecureUpgrade('npm', ['run', 'lint', '--', '--fix']);
        this.logger.log('✅ [AUTO_FORMAT] Pre-emptive lint fixes applied cleanly to active buffer entries.');
      } catch (fixError: any) {
        this.logger.warn(`⚠️ [AUTO_FORMAT_WARNING] Lint fixer exited with non-zero output, processing static safety passes...`);
      }

      // 6. Pre-Commit Validation Gates (Static Analysis & System Compilation)
      this.logger.log(`🔍 [SAFETY_CHECK] Triggering validation checks for code file ${fileName}...`);
      try {
        await this.runSecureUpgrade('npm', ['run', 'lint']);
      } catch (lintError: any) {
        throw new Error(`Code validation failure: The modified code blocks violate active ESLint/TSLint security standards.`);
      }

      try {
        await this.runSecureUpgrade('npm', ['run', 'build']);
      } catch (buildError: any) {
        throw new Error(`Compilation validation failure: The generated patch breaks the system production bundle build routine.`);
      }

      // 7. Secure Version Control Commit Phase
      this.logger.log(`📦 [GIT_COMMIT] Indexing and committing modifications to local branch: ${targetBranch}`);
      await this.executeGitCommand(['add', sourceFilePath]);
      await this.executeGitCommand(['commit', '-m', `fix(claw): isolated auto-healing patch verified and applied to ${fileName}`]);

      // 8. Automate Remote Push Interactivity (git push origin <branch>)
      this.logger.log(`🚀 [GIT_PUSH] Syncing feature branch ${targetBranch} with upstream remote GitHub cluster...`);
      await this.executeGitCommand(['push', 'origin', targetBranch]);
      pushedUpstream = true;
      this.logger.log(`✅ [GIT_PUSH] Branch successfully synced online with GitHub storage vectors.`);

      // 9. Context Reset: Return cleanly to the original primary starting active branch track
      await this.executeGitCommand(['checkout', initialBranchName]);
      this.logger.log(`✅ [GIT_ISOLATION] Restored workspace HEAD path pointer node to branch: ${initialBranchName}`);

    } catch (repairError: any) {
      this.logger.error(`❌ [GIT_ISOLATION_ABORT] Code validation gate blocked operation for ${fileName}: ${repairError.message}. Initiating rollback...`);
      
      try {
        await this.executeGitCommand(['reset', '--hard']);
        await this.executeGitCommand(['checkout', initialBranchName]);
      } catch (rollbackErr: any) {
        this.logger.error(`🚨 [CRITICAL_ROLLBACK_FAILURE] Unable to restore workspace head pointer: ${rollbackErr.message}`);
      }

      await this.dispatchFailureNotification(fileName, targetBranch, repairError.message);
      return { repaired: false, file: fileName, branch: null, pushedUpstream: false, processedAt: resolutionTimestamp };
    }

    try {
      if ((this.prisma as any).aiWatchdogLog) {
        await (this.prisma as any).aiWatchdogLog.create({
          data: {
            incidentType: 'REMOTE_PUSH_VERIFIED_PATCH',
            status: 'RESOLVED',
            executionNotes: `Autonomous branch ${targetBranch} created, linted, verified, and successfully pushed upstream to remote origin server repository.`,
            environment: process.env.NODE_ENV || 'development',
            createdAt: new Date()
          }
        });
      }
    } catch (innerDbErr: any) {
      this.logger.debug(`Could not write completion metrics log to database: ${innerDbErr.message}`);
    }

    return { repaired: true, file: fileName, branch: targetBranch, pushedUpstream, processedAt: resolutionTimestamp };
  }

  /**
   * 🔒 Secure Process Spawning Engine
   * Eliminates shell execution vulnerabilities to resolve the DEP0190 security warning.
   */
  private runSecureUpgrade(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        shell: false, // Core security constraint unblocking DEP0190 compliance
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => (stdout += data.toString()));
      child.stderr.on('data', (data) => (stderr += data.toString()));

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(stderr || `Process exited with error code ${code}`));
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Executes explicit Git version control calls securely without a subshell wrapper.
   */
  private async executeGitCommand(args: string[]): Promise<string> {
    try {
      return await this.runSecureUpgrade('git', args);
    } catch (error: any) {
      throw new Error(`Git command [git ${args.join(' ')}] failed: ${error.message}`);
    }
  }

  /**
   * Captures an immutable source backup code file snapshot prior to automated healing modifications.
   */
  private async createFileRollbackSnapshot(sourceFilePath: string, fileName: string): Promise<void> {
    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      const destination = path.join(this.backupDirectory, `${Date.now()}_BAK_${fileName}`);
      
      const content = await fs.readFile(sourceFilePath, 'utf8').catch(() => null);
      if (content) {
        await fs.writeFile(destination, content, 'utf8');
        this.logger.log(`💾 [BACKUP] Local snapshot created securely at: ${destination}`);
      }
    } catch (err: any) {
      this.logger.error(`[BACKUP_FAILURE] Snapshot allocation aborted: ${err.message}`);
    }
  }

  /**
   * Resolves incoming file names safely to their absolute internal source folder maps.
   */
  private resolveWorkspaceFilePath(fileName: string): string {
    // Looks for matches in standard working directory zones (e.g. backend source root or component views)
    if (fileName.endsWith('.tsx')) {
      return path.resolve(process.cwd(), 'src', 'ai', fileName);
    }
    return path.resolve(process.cwd(), 'src', 'ai', fileName);
  }

  /**
   * Dispatches alerts outward to support staff or chat webhooks when a build patch fails static validation.
   */
  private async dispatchFailureNotification(file: string, branch: string, error: string): Promise<void> {
    this.logger.error(`🚨 [ALERT DISPATCH] Self-healing sequence rejected for ${file} on branch ${branch}. Diagnostic trace: ${error}`);
    // Future expansion: hook third-party notification clients here (e.g., this.mailService.sendSystemErrorAlert(...))
  }
}

