import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessControlService, type ActorContext } from '../process-control/process-control.service';
import { ProductMasterService } from '../product-master/product-master.service';
import {
  isWmsReceiptBridgeEnabled,
  isWmsReceiptBridgeEnforcing,
  severityBlocksProcess,
} from '../process-control/process-control.policy';
import { reconcileGoodsReceipt, shouldBlockCompletion, type ReceiptLineInput } from './goods-receipt.policy';

export const WMS_GOODS_RECEIPT_CODE = 'WMS.GOODS_RECEIPT';

/**
 * The canonical goods-receipt standard, version 1.
 *
 * This is intentionally readable: it is the artefact an operations lead is
 * asked to approve, and the steps map one-to-one onto what a receiving clerk
 * actually does at the dock.
 */
const GOODS_RECEIPT_STEPS = [
  {
    stepNumber: 1,
    code: 'VERIFY_SKU',
    name: 'Validate product / variant / SKU',
    description:
      'Confirm every received line resolves to an approved product variant in governed master data. Unknown codes are an exception, never a silent booking.',
    type: 'INSPECTION',
    requiresEvidence: true,
    evidenceSchema: { required: ['lines'] },
    validationRules: { notEmpty: ['lines'] },
    allowedRoles: ['WAREHOUSE', 'MANAGER', 'ADMIN', 'COMPANY_ADMIN'],
    nextStepOnSuccess: 'INSPECT_QUANTITY',
    nextStepOnException: 'INSPECT_QUANTITY',
    slaMinutes: 30,
  },
  {
    stepNumber: 2,
    code: 'INSPECT_QUANTITY',
    name: 'Inspect quantity and condition',
    description:
      'Count what arrived against the ASN/PO, record damage, and capture the evidence that supports any variance.',
    type: 'INSPECTION',
    requiresEvidence: true,
    evidenceSchema: { required: ['countedQty'] },
    validationRules: { nonNegative: ['countedQty'] },
    allowedRoles: ['WAREHOUSE', 'MANAGER', 'ADMIN', 'COMPANY_ADMIN'],
    nextStepOnSuccess: 'PUT_AWAY',
    slaMinutes: 60,
  },
  {
    stepNumber: 3,
    code: 'PUT_AWAY',
    name: 'Put away good stock',
    description: 'Move accepted units to a bin location so on-hand stock matches what is on the shelf.',
    type: 'HANDOFF',
    requiresEvidence: true,
    evidenceSchema: { required: ['putAwayBinId'] },
    validationRules: { notEmpty: ['putAwayBinId'] },
    allowedRoles: ['WAREHOUSE', 'MANAGER', 'ADMIN', 'COMPANY_ADMIN'],
    nextStepOnSuccess: 'RECORD_OUTCOME',
    slaMinutes: 120,
  },
  {
    stepNumber: 4,
    code: 'RECORD_OUTCOME',
    name: 'Record the process outcome',
    description:
      'Close the receipt with its measured facts: cycle time, incidents, and whether it was right first time.',
    type: 'APPROVAL',
    allowedRoles: ['WAREHOUSE', 'MANAGER', 'ADMIN', 'COMPANY_ADMIN'],
  },
];

/**
 * Bridge between the WMS goods-receipt flow and the Process Book.
 *
 * Behaviour is deliberately conservative:
 *   • the whole bridge is off unless PROCESS_CONTROL_ENABLED and
 *     PROCESS_CONTROL_WMS_RECEIPT_ENABLED are both true;
 *   • while PROCESS_CONTROL_WMS_RECEIPT_ENFORCE is false (the default) the
 *     standard *observes and records* — it never stops a clerk from finishing a
 *     receipt during a pilot;
 *   • any bridge failure is logged and swallowed while not enforcing, so a
 *     problem in Process Control can never break receiving.
 */
@Injectable()
export class GoodsReceiptProcessBridge {
  private readonly logger = new Logger(GoodsReceiptProcessBridge.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processControl: ProcessControlService,
    private readonly products: ProductMasterService,
  ) {}

  isEnabled(): boolean {
    return isWmsReceiptBridgeEnabled();
  }

  isEnforcing(): boolean {
    return isWmsReceiptBridgeEnforcing();
  }

  /**
   * Called when a receipt is created (ASN booked in). Starts the standard, if
   * one is available, and links the instance to the receipt.
   */
  async onReceiptCreated(
    companyId: string,
    receipt: { id: string; receiptNumber: string; poNumber?: string | null; supplierName?: string | null; warehouseId?: string | null },
    actor: ActorContext,
  ): Promise<{ started: boolean; reason?: string }> {
    if (!this.isEnabled()) return { started: false, reason: 'bridge disabled' };

    try {
      const definition = await this.ensureDefinition(companyId, actor);
      if (!definition) return { started: false, reason: 'no executable standard' };

      const instance = await this.processControl.startInstance(companyId, actor, {
        definitionId: definition.id,
        businessKey: receipt.receiptNumber,
        context: {
          source: 'WMS.GOODS_RECEIPT',
          goodsReceiptId: receipt.id,
          receiptNumber: receipt.receiptNumber,
          poNumber: receipt.poNumber ?? null,
          supplierName: receipt.supplierName ?? null,
          warehouseId: receipt.warehouseId ?? null,
        },
        goodsReceiptId: receipt.id,
      });

      return { started: true, reason: (instance as any)?.id };
    } catch (err) {
      this.logger.warn(
        `Goods-receipt bridge could not start the standard for ${receipt.receiptNumber}: ${
          (err as Error)?.message
        }`,
      );
      return { started: false, reason: (err as Error)?.message };
    }
  }

  /**
   * Called when the received quantities are captured. Reconciles the receipt
   * against the expectation, walks the standard, and raises incidents for every
   * exception found.
   *
   * Returns the reconciliation so the caller can decide whether to block
   * completion. When enforcement is on and a blocking incident exists, this
   * throws — the receipt is not marked complete.
   */
  async onGoodsReceived(
    companyId: string,
    receipt: { id: string; receiptNumber: string; expectedQty?: number | null; receivedQty?: number | null },
    lines: ReceiptLineInput[],
    actor: ActorContext,
  ) {
    const reconciliation = reconcileGoodsReceipt(lines);

    if (!this.isEnabled()) {
      return { reconciliation, instanceId: null as string | null, blockDecision: { blocked: false } };
    }

    try {
      const instance = await this.prisma.processInstance.findFirst({
        where: { companyId, goodsReceiptId: receipt.id },
        include: { currentStep: true },
      });

      if (!instance) {
        return {
          reconciliation,
          instanceId: null,
          blockDecision: shouldBlockCompletion(reconciliation, this.isEnforcing()),
        };
      }

      await this.completeStepIfCurrent(companyId, instance.id, 'VERIFY_SKU', actor, {
        lines: lines.map((l) => l.sku),
        unknownSkus: reconciliation.lines.filter((l) => l.unknownSku).map((l) => l.sku),
      });

      await this.completeStepIfCurrent(companyId, instance.id, 'INSPECT_QUANTITY', actor, {
        countedQty: reconciliation.totals.receivedQty,
        damagedQty: reconciliation.totals.damagedQty,
        expectedQty: reconciliation.totals.expectedQty,
      });

      for (const incident of reconciliation.incidents) {
        await this.raiseIncident(companyId, instance.id, actor, incident);
      }

      const blockDecision = shouldBlockCompletion(reconciliation, this.isEnforcing());
      if (blockDecision.blocked) {
        return { reconciliation, instanceId: instance.id, blockDecision };
      }

      await this.completeStepIfCurrent(companyId, instance.id, 'PUT_AWAY', actor, {
        putAwayBinId: lines.find((l) => l.putAwayBinId)?.putAwayBinId ?? null,
        lines: reconciliation.lines.filter((l) => l.goodQty > 0).length,
      });

      // The final step of the standard is the act of closing it out; walking it
      // keeps the standard and the execution record in step with each other.
      await this.completeStepIfCurrent(companyId, instance.id, 'RECORD_OUTCOME', actor, {
        outcome: reconciliation.outcome,
        incidentCodes: reconciliation.incidents.map((i) => i.code),
        receivedQty: reconciliation.totals.receivedQty,
        damagedQty: reconciliation.totals.damagedQty,
      });

      await this.processControl.recordOutcome(companyId, actor, instance.id, {
        lessonsLearned:
          reconciliation.outcome === 'CLEAN'
            ? undefined
            : `Receipt raised ${reconciliation.incidents.length} exception(s): ${reconciliation.incidents
                .map((i) => i.code)
                .join(', ')}`,
      });

      return { reconciliation, instanceId: instance.id, blockDecision };
    } catch (err) {
      const decision = shouldBlockCompletion(reconciliation, this.isEnforcing());
      if (err instanceof ConflictException && decision.blocked) throw err;

      this.logger.warn(
        `Goods-receipt bridge failed for ${receipt.receiptNumber}: ${(err as Error)?.message}`,
      );
      return { reconciliation, instanceId: null, blockDecision: { blocked: false } };
    }
  }

  /**
   * A receipt that failed reconciliation in enforcing mode must be refused
   * before the WMS marks it COMPLETED.
   */
  assertCompletionAllowed(blockDecision: { blocked: boolean; reason?: string }): void {
    if (blockDecision.blocked) {
      throw new ConflictException(
        `Receipt cannot be completed while blocking exceptions are open: ${blockDecision.reason}`,
      );
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async ensureDefinition(companyId: string, actor: ActorContext) {
    const existing = await this.prisma.processDefinition.findFirst({
      where: { companyId, code: WMS_GOODS_RECEIPT_CODE },
      include: { currentVersion: { include: { steps: true } } },
    });

    if (existing?.currentVersion && existing.currentVersion.steps.length > 0) {
      return existing;
    }

    if (existing) {
      // A definition exists but has no executable version — leave it alone
      // rather than silently approving standards on the tenant's behalf.
      this.logger.warn(
        `${WMS_GOODS_RECEIPT_CODE} exists for company ${companyId} but has no executable version`,
      );
      return null;
    }

    const definition = await this.processControl.createDefinition(companyId, actor, {
      code: WMS_GOODS_RECEIPT_CODE,
      name: 'Goods receipt',
      description:
        'Receiving standard: validate master data, inspect quantity and condition, put away good stock, record the outcome.',
      category: 'Warehouse',
      ownerRole: 'WAREHOUSE',
    });

    const version = await this.processControl.createVersion(companyId, actor, definition.id, {
      steps: GOODS_RECEIPT_STEPS,
    });

    // Piloted, NOT approved. Approving a standard is a human decision — the
    // bridge provisions the default WMS.GOODS_RECEIPT standard so a pilot can
    // start, and a manager approves it in the Process Book once the evidence
    // says it is how the operation should work. A pilot version is executable,
    // so nothing is blocked by leaving it unapproved.
    await this.processControl.transitionVersion(
      companyId,
      actor,
      version.id,
      'PILOT',
      'Auto-provisioned by the goods-receipt bridge — awaiting human approval',
    );

    return this.prisma.processDefinition.findFirst({
      where: { id: definition.id, companyId },
      include: { currentVersion: { include: { steps: true } } },
    });
  }

  private async completeStepIfCurrent(
    companyId: string,
    instanceId: string,
    stepCode: string,
    actor: ActorContext,
    evidence: Record<string, unknown>,
  ) {
    const current = await this.prisma.processStepInstance.findFirst({
      where: { instanceId, status: 'IN_PROGRESS' as any },
      include: { stepDefinition: true },
      orderBy: { stepNumber: 'asc' },
    });

    // The bridge only drives the step the instance is actually sitting on; it
    // never rewinds or skips ahead of a human.
    if (!current || current.stepDefinition.code !== stepCode) return null;

    try {
      return await this.processControl.completeStep(companyId, actor, instanceId, 'SUCCESS', {
        evidence,
        result: evidence,
      });
    } catch (err) {
      this.logger.warn(
        `Bridge could not complete step ${stepCode} on instance ${instanceId}: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  private async raiseIncident(
    companyId: string,
    instanceId: string,
    actor: ActorContext,
    incident: { code: string; name: string; severity: string; isBlocking: boolean; detail: string; sku?: string },
  ) {
    const existing = await this.prisma.processIncident.findFirst({
      where: { companyId, instanceId, code: incident.code, status: { in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] as any } },
    });
    if (existing) return existing;

    try {
      return await this.processControl.raiseIncident(companyId, actor, instanceId, {
        code: incident.code,
        name: incident.name,
        description: incident.detail,
        severity: incident.severity,
        isBlocking: incident.isBlocking ?? severityBlocksProcess(incident.severity as any),
        evidence: { sku: incident.sku ?? null, detail: incident.detail },
      });
    } catch (err) {
      this.logger.warn(
        `Bridge could not raise incident ${incident.code} on instance ${instanceId}: ${(err as Error)?.message}`,
      );
      return null;
    }
  }
}
