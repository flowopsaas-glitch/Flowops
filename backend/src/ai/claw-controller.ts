import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// Corrected naming alignment to match AiEventsService export
import { AiEventsService } from './ai-events.service';

@Injectable()
export class AIClawController {
  private readonly logger = new Logger(AIClawController.name);

  constructor(
    private prisma: PrismaService,
    private aiEvents: AiEventsService,
  ) {}

  /**
   * PHASE 1: The Architect (Claw 1)
   * Prevents "Record not found" errors by verifying data exists 
   * before any execution plan is created.
   */
  async architectPlan(communicationId: number, companyId: number) {
    this.logger.log(`[Claw 1] Architecting plan for Comm ID: ${communicationId}`);
    
    // Architect check: Validates tenant isolation and existence
    const record = await this.prisma.emailHubItem.findUnique({
      where: { id: String(communicationId), companyId: String(companyId) },
    });

    if (!record) {
      throw new Error(`[Claw 1] Safety Trip: Communication ${communicationId} not found for company ${companyId}.`);
    }

    return {
      target: 'emailHubItem',
      action: 'update',
      payload: { id: communicationId },
    };
  }

  /**
   * PHASE 2: The Implementer (Claw 2)
   * Executes the blueprint. Uses dynamic Prisma access with 
   * type-safe casting to prevent TS2339 errors.
   */
  async implement(plan: any, extractedData: any) {
    this.logger.log(`[Claw 2] Implementing ${plan.action} on ${plan.target}`);

    // EmailHubItem columns only (see prisma/schema.prisma): there is no
    // `aiMetadata` column, and `status` must be one of the documented values
    // NEW|TRIAGED|IN_PROGRESS|WAITING|RESOLVED|ARCHIVED. Persist the extraction
    // into `aiSummary` and mark the item handled via the canonical `resolved`
    // flag.
    const aiSummary =
      typeof extractedData === 'string'
        ? extractedData
        : JSON.stringify(extractedData ?? {});

    // The canonical handled-write. `resolved` + `needsOpsAction` are the source
    // of truth the Email Hub UI reads; these columns have existed since the
    // model was introduced so this write is always valid.
    const canonical = { aiSummary, resolved: true, needsOpsAction: false };

    try {
      // Cast prisma to 'any' for dynamic table targeting (e.g., emailHubItem vs waybill).
      // Preferred path also aligns the cosmetic `status` column to 'RESOLVED'.
      return await (this.prisma as any)[plan.target].update({
        where: { id: String(plan.payload.id) },
        data: { ...canonical, status: 'RESOLVED' },
      });
    } catch (error: any) {
      // If a deployment drifts to a Prisma client generated before the `status`
      // column existed, the engine throws `Unknown argument status`. That is a
      // cosmetic-only failure — the item is still fully handled. Retry the
      // canonical write WITHOUT `status` so the record is marked resolved and
      // Claw 3 is never spammed with a bogus "Logic Failure" each sweep.
      if (/unknown argument.*status/i.test(error?.message ?? '')) {
        try {
          return await (this.prisma as any)[plan.target].update({
            where: { id: String(plan.payload.id) },
            data: canonical,
          });
        } catch (retryError: any) {
          return { failed: true, error: retryError.message };
        }
      }

      // Genuine failures still flow to Claw 3 for analysis.
      return { failed: true, error: error.message };
    }
  }

  /**
   * PHASE 3: The Debugger (Claw 3)
   * Automatically triggers the "Learn" module to correct logic patterns.
   */
  async resolve(errorContext: string, companyId: number) {
    this.logger.error(`[Claw 3] Logic Failure Detected: ${errorContext}`);

    // Standardized 'Flat' DTO structure to satisfy backend validation
    await this.aiEvents.learnLogic({
      companyId,
      errorContext,
      type: 'DATABASE_TARGET_CORRECTION',
      newValue: 'prisma.emailHubItem.update',
      suggestedResolution: 'The Implementer targeted a non-existent record; redirecting to EmailHubItem.',
    });

    return { status: 'Learned', resolution: 'Strategy updated and recorded for Company ' + companyId };
  }
}
