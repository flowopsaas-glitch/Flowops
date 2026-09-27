import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canRecordOutcome,
  canRoleExecuteStep,
  canTransitionInstance,
  canTransitionVersion,
  computeVersionContentHash,
  evaluateOutcome,
  evaluateValidationRules,
  isMandatoryEvidenceSatisfied,
  isProcessControlEnabled,
  isVersionEditable,
  isVersionExecutable,
  processControlGate,
  resolveNextStepCode,
  severityBlocksProcess,
  type IncidentSeverity,
  type ProcessInstanceStatus,
  type ProcessLifecycleStatus,
  type StepOutcome,
} from './process-control.policy';

export interface ActorContext {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
  permissions?: Record<string, boolean> | null;
}

type Json = Record<string, unknown> | undefined;

/**
 * Process Control execution service.
 *
 * Multi-tenant rules enforced here:
 *   • every read/write is scoped by companyId (no cross-tenant lookups);
 *   • business keys are unique per tenant and never reused, so a replayed
 *     event returns the existing instance instead of creating a duplicate;
 *   • approved standards are immutable — edits happen through a new version;
 *   • every state change writes a ProcessAuditEvent.
 *
 * The whole capability is gated: with PROCESS_CONTROL_ENABLED=false (the
 * default) nothing here may run, and in a production environment it stays off
 * even if the flag is set, unless PROCESS_CONTROL_PRODUCTION_ALLOWED=true.
 */
@Injectable()
export class ProcessControlService {
  private readonly logger = new Logger(ProcessControlService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Gate ──────────────────────────────────────────────────────────────────

  isEnabled(): boolean {
    return processControlGate().allowed;
  }

  private assertEnabled(): void {
    const gate = processControlGate();
    if (!gate.allowed) throw new ForbiddenException(gate.reason);
  }

  // ── Definitions ───────────────────────────────────────────────────────────

  async createDefinition(companyId: string, actor: ActorContext, dto: any) {
    this.assertEnabled();

    const existing = await this.prisma.processDefinition.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) {
      // Idempotent create: the same SOP key in the same tenant returns the
      // existing definition rather than duplicating the standard.
      return existing;
    }

    const definition = await this.prisma.processDefinition.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        ownerRole: dto.ownerRole ?? null,
        isActive: true,
      },
    });

    await this.audit(companyId, actor, {
      definitionId: definition.id,
      eventType: 'CREATED',
      description: `Process definition ${definition.code} created`,
      afterState: { code: definition.code, name: definition.name },
    });

    return definition;
  }

  async listDefinitions(companyId: string) {
    this.assertEnabled();
    return this.prisma.processDefinition.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNumber: 'desc' }, select: versionSummarySelect() },
      },
    });
  }

  async getDefinition(companyId: string, definitionId: string) {
    this.assertEnabled();
    const definition = await this.prisma.processDefinition.findFirst({
      where: { id: definitionId, companyId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            automationRules: true,
          },
        },
      },
    });
    if (!definition) throw new NotFoundException('Process definition not found');
    return definition;
  }

  /**
   * The Process Book view: every standard, its versions, and the execution
   * evidence behind them. This is the page an auditor or operations lead reads.
   */
  async getProcessBook(companyId: string) {
    this.assertEnabled();

    const [definitions, instanceStats] = await Promise.all([
      this.prisma.processDefinition.findMany({
        where: { companyId },
        orderBy: { code: 'asc' },
        include: {
          currentVersion: { select: versionSummarySelect() },
          versions: {
            orderBy: { versionNumber: 'desc' },
            select: { ...versionSummarySelect(), _count: { select: { steps: true, instances: true } } },
          },
        },
      }),
      this.prisma.processInstance.groupBy({
        by: ['definitionId', 'status'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const statsByDefinition = new Map<string, Record<string, number>>();
    for (const row of instanceStats) {
      const bucket = statsByDefinition.get(row.definitionId) ?? {};
      bucket[row.status] = row._count._all;
      statsByDefinition.set(row.definitionId, bucket);
    }

    return definitions.map((definition) => ({
      ...definition,
      execution: {
        inProgress: statsByDefinition.get(definition.id)?.IN_PROGRESS ?? 0,
        blocked: statsByDefinition.get(definition.id)?.BLOCKED ?? 0,
        completed: statsByDefinition.get(definition.id)?.COMPLETED ?? 0,
        abandoned: statsByDefinition.get(definition.id)?.ABANDONED ?? 0,
        failed: statsByDefinition.get(definition.id)?.FAILED ?? 0,
      },
    }));
  }

  async listIncidents(companyId: string, filters?: { status?: string; severity?: string }) {
    this.assertEnabled();
    return this.prisma.processIncident.findMany({
      where: {
        companyId,
        status: filters?.status as any,
        severity: filters?.severity as any,
      },
      orderBy: { detectedAt: 'desc' },
      take: 200,
      include: {
        instance: {
          select: { id: true, businessKey: true, status: true, definitionId: true, goodsReceiptId: true },
        },
        solutions: true,
      },
    });
  }

  async listInstances(companyId: string, filters?: { status?: string; definitionId?: string }) {
    this.assertEnabled();
    return this.prisma.processInstance.findMany({
      where: {
        companyId,
        status: filters?.status as any,
        definitionId: filters?.definitionId,
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
      include: {
        definition: { select: { code: true, name: true } },
        version: { select: { versionNumber: true, status: true } },
        currentStep: { select: { code: true, name: true, stepNumber: true } },
        outcome: true,
        _count: { select: { incidents: true } },
      },
    });
  }

  async getInstance(companyId: string, instanceId: string) {
    this.assertEnabled();
    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, companyId },
      include: {
        definition: true,
        version: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        currentStep: true,
        stepInstances: { orderBy: [{ stepNumber: 'asc' }, { attempt: 'asc' }] },
        incidents: { orderBy: { detectedAt: 'desc' }, include: { solutions: true } },
        outcome: true,
        auditEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!instance) throw new NotFoundException('Process instance not found');
    return instance;
  }

  // ── Versions ──────────────────────────────────────────────────────────────

  async createVersion(companyId: string, actor: ActorContext, definitionId: string, dto: any) {
    this.assertEnabled();

    const definition = await this.prisma.processDefinition.findFirst({
      where: { id: definitionId, companyId },
    });
    if (!definition) throw new NotFoundException('Process definition not found');

    const steps = (dto.steps ?? []) as any[];
    if (steps.length === 0) {
      throw new BadRequestException('A process version needs at least one step');
    }
    assertStepsAreWellFormed(steps);

    const last = await this.prisma.processVersion.findFirst({
      where: { definitionId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const versionNumber = (last?.versionNumber ?? 0) + 1;

    const automationRules = (dto.automationRules ?? []) as any[];
    const contentHash = computeVersionContentHash(steps, automationRules);

    const version = await this.prisma.processVersion.create({
      data: {
        companyId,
        definitionId,
        versionNumber,
        status: 'DRAFT',
        contentHash,
        createdById: actor.userId ?? null,
        steps: {
          create: steps.map((step) => ({
            companyId,
            stepNumber: step.stepNumber,
            code: step.code,
            name: step.name,
            description: step.description ?? null,
            type: (step.type ?? 'MANUAL') as any,
            isAutomated: step.isAutomated ?? false,
            requiresHumanApproval: step.requiresHumanApproval ?? true,
            requiresEvidence: step.requiresEvidence ?? false,
            evidenceSchema: step.evidenceSchema ?? undefined,
            validationRules: step.validationRules ?? undefined,
            nextStepOnSuccess: step.nextStepOnSuccess ?? null,
            nextStepOnFailure: step.nextStepOnFailure ?? null,
            nextStepOnException: step.nextStepOnException ?? null,
            allowedRoles: step.allowedRoles ?? [],
            slaMinutes: step.slaMinutes ?? null,
          })),
        },
        ...(automationRules.length > 0
          ? {
              automationRules: {
                create: automationRules.map((rule: any) => ({
                  companyId,
                  code: rule.code,
                  name: rule.name,
                  description: rule.description ?? null,
                  triggerType: rule.triggerType ?? 'STEP_COMPLETED',
                  triggerConfig: rule.triggerConfig ?? {},
                  actionType: rule.actionType ?? 'RAISE_INCIDENT',
                  actionConfig: rule.actionConfig ?? {},
                  maxRunsPerInstance: rule.maxRunsPerInstance ?? 1,
                  requiresHumanApproval: rule.requiresHumanApproval ?? true,
                  isActive: rule.isActive ?? true,
                })),
              },
            }
          : {}),
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, automationRules: true },
    });

    await this.audit(companyId, actor, {
      definitionId,
      versionId: version.id,
      eventType: 'VERSION_CREATED',
      description: `Version ${versionNumber} of ${definition.code} created with ${steps.length} step(s)`,
      afterState: { versionNumber, contentHash },
    });

    return version;
  }

  async updateVersionSteps(companyId: string, actor: ActorContext, versionId: string, dto: any) {
    this.assertEnabled();

    const version = await this.prisma.processVersion.findFirst({
      where: { id: versionId, companyId },
    });
    if (!version) throw new NotFoundException('Process version not found');
    if (!isVersionEditable(version.status as ProcessLifecycleStatus)) {
      throw new ConflictException(
        `Version ${version.versionNumber} is ${version.status} and cannot be edited — create a new version instead`,
      );
    }

    const steps = (dto.steps ?? []) as any[];
    assertStepsAreWellFormed(steps);

    const contentHash = computeVersionContentHash(steps, []);
    await this.prisma.$transaction(async (tx) => {
      await tx.processStepDefinition.deleteMany({ where: { versionId } });
      await tx.processStepDefinition.createMany({
        data: steps.map((step) => ({
          companyId,
          versionId,
          stepNumber: step.stepNumber,
          code: step.code,
          name: step.name,
          description: step.description ?? null,
          type: step.type ?? 'MANUAL',
          isAutomated: step.isAutomated ?? false,
          requiresHumanApproval: step.requiresHumanApproval ?? true,
          requiresEvidence: step.requiresEvidence ?? false,
          evidenceSchema: step.evidenceSchema ?? undefined,
          validationRules: step.validationRules ?? undefined,
          nextStepOnSuccess: step.nextStepOnSuccess ?? null,
          nextStepOnFailure: step.nextStepOnFailure ?? null,
          nextStepOnException: step.nextStepOnException ?? null,
          allowedRoles: step.allowedRoles ?? [],
          slaMinutes: step.slaMinutes ?? null,
        })) as any,
      });
      await tx.processVersion.update({ where: { id: versionId }, data: { contentHash } });
    });

    await this.audit(companyId, actor, {
      versionId,
      definitionId: version.definitionId,
      eventType: 'VERSION_UPDATED',
      description: `Draft version ${version.versionNumber} steps replaced`,
      afterState: { contentHash, stepCount: steps.length },
    });

    return this.prisma.processVersion.findUnique({
      where: { id: versionId },
      include: { steps: { orderBy: { stepNumber: 'asc' } }, automationRules: true },
    });
  }

  async transitionVersion(
    companyId: string,
    actor: ActorContext,
    versionId: string,
    target: ProcessLifecycleStatus,
    note?: string,
  ) {
    this.assertEnabled();

    const version = await this.prisma.processVersion.findFirst({
      where: { id: versionId, companyId },
      include: { steps: true, definition: true },
    });
    if (!version) throw new NotFoundException('Process version not found');

    const from = version.status as ProcessLifecycleStatus;
    if (!canTransitionVersion(from, target)) {
      throw new ConflictException(`A ${from} version cannot move to ${target}`);
    }

    if (target === 'PILOT' || target === 'APPROVED') {
      if (version.steps.length === 0) {
        throw new BadRequestException('Cannot move a version with no steps out of draft');
      }
      assertStepsAreWellFormed(version.steps);
    }

    if (target === 'APPROVED') {
      if (!canApprove(actor)) {
        await this.audit(companyId, actor, {
          versionId,
          definitionId: version.definitionId,
          eventType: 'ACCESS_DENIED',
          description: `User attempted to approve version ${version.versionNumber} without an approval role`,
        });
        throw new ForbiddenException('Approving a standard requires a manager or admin role');
      }
    }

    const now = new Date();
    const data: any = { status: target };
    if (target === 'PILOT') data.pilotStartedAt = now;
    if (target === 'APPROVED') {
      data.approvedById = actor.userId ?? 'SYSTEM';
      data.approvedAt = now;
      data.isImmutable = true;
    }
    if (target === 'RETIRED') {
      data.retiredAt = now;
      data.retiredById = actor.userId ?? 'SYSTEM';
    }

    const updated = await this.prisma.processVersion.update({ where: { id: versionId }, data });

    // An approved version becomes the definition's current standard.
    if (target === 'APPROVED') {
      await this.prisma.processDefinition.update({
        where: { id: version.definitionId },
        data: { currentVersionId: versionId },
      });
    }

    const eventType =
      target === 'APPROVED'
        ? 'VERSION_APPROVED'
        : target === 'PILOT'
          ? 'VERSION_PILOTED'
          : target === 'RETIRED'
            ? 'VERSION_RETIRED'
            : 'VERSION_REVERTED';

    await this.audit(companyId, actor, {
      versionId,
      definitionId: version.definitionId,
      eventType,
      description: `Version ${version.versionNumber} of ${version.definition.code}: ${from} → ${target}${
        note ? ` (${note})` : ''
      }`,
      beforeState: { status: from },
      afterState: { status: target },
    });

    return updated;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Start (or resume) execution of a standard.
   *
   * Idempotent: `businessKey` is unique per tenant, so a replayed goods-receipt
   * event, a duplicated webhook, or a user double-tapping "start" all return
   * the same instance. No duplicate work, no duplicated evidence.
   */
  async startInstance(companyId: string, actor: ActorContext, dto: any) {
    this.assertEnabled();

    const definition = dto.definitionId
      ? await this.prisma.processDefinition.findFirst({
          where: { id: dto.definitionId, companyId },
        })
      : await this.prisma.processDefinition.findFirst({
          where: { companyId, code: dto.definitionCode },
        });

    if (!definition) throw new NotFoundException('Process definition not found');

    const existing = await this.prisma.processInstance.findFirst({
      where: { companyId, businessKey: dto.businessKey },
      include: { currentStep: true },
    });
    if (existing) return existing;

    const version = definition.currentVersionId
      ? await this.prisma.processVersion.findFirst({
          where: { id: definition.currentVersionId, companyId },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        })
      : await this.prisma.processVersion.findFirst({
          where: { companyId, definitionId: definition.id, status: 'PILOT' as any },
          orderBy: { versionNumber: 'desc' },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        });

    if (!version) {
      throw new ConflictException(
        `${definition.code} has no approved or pilot version to execute`,
      );
    }
    if (!isVersionExecutable(version.status as ProcessLifecycleStatus)) {
      throw new ConflictException(`${definition.code} version ${version.versionNumber} is not executable`);
    }
    if (version.steps.length === 0) {
      throw new ConflictException(`${definition.code} version ${version.versionNumber} has no steps`);
    }

    const firstStep = version.steps[0];
    const now = new Date();

    let instanceId: string;
    try {
      instanceId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.processInstance.create({
          data: {
            companyId,
            definitionId: definition.id,
            versionId: version.id,
            businessKey: dto.businessKey,
            status: 'IN_PROGRESS',
            currentStepId: firstStep.id,
            context: dto.context ?? undefined,
            startedById: actor.userId ?? null,
            startedAt: now,
            goodsReceiptId: dto.goodsReceiptId ?? null,
          },
        });

        await tx.processStepInstance.create({
          data: {
            companyId,
            instanceId: created.id,
            stepDefinitionId: firstStep.id,
            stepNumber: firstStep.stepNumber,
            code: firstStep.code,
            name: firstStep.name,
            attempt: 1,
            status: 'IN_PROGRESS',
            startedAt: now,
            executedById: actor.userId ?? null,
            executedByName: actor.name ?? null,
          },
        });

        return created.id;
      });
    } catch (err) {
      // Two callers can race past the idempotency check above: both see no
      // instance, both attempt the insert, and the unique index on
      // (companyId, businessKey) lets exactly one win. The loser must return the
      // winner's instance — an idempotent start is a promise to the caller, and
      // a duplicated webhook must not surface a constraint error to the dock.
      const winner = await this.prisma.processInstance.findFirst({
        where: { companyId, businessKey: dto.businessKey },
        include: { currentStep: true },
      });
      if (winner) return winner;
      throw err;
    }

    await this.audit(companyId, actor, {
      definitionId: definition.id,
      versionId: version.id,
      instanceId,
      eventType: 'INSTANCE_STARTED',
      description: `Started ${definition.code} v${version.versionNumber} for ${dto.businessKey}`,
      afterState: { businessKey: dto.businessKey, firstStep: firstStep.code },
    });

    return this.prisma.processInstance.findUnique({
      where: { id: instanceId },
      include: { currentStep: true },
    });
  }

  /**
   * Complete the step the instance is currently sitting on.
   *
   * Refuses when: the instance is terminal, a blocking incident is open, the
   * actor's role is not allowed to execute this step, or the step's evidence
   * contract / validation rules are not satisfied.
   */
  async completeStep(
    companyId: string,
    actor: ActorContext,
    instanceId: string,
    outcome: StepOutcome,
    dto: any,
  ) {
    this.assertEnabled();

    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, companyId },
      include: {
        version: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        currentStep: true,
      },
    });
    if (!instance) throw new NotFoundException('Process instance not found');
    if (instance.status === 'COMPLETED' || instance.status === 'ABANDONED' || instance.status === 'FAILED') {
      throw new ConflictException(`Instance is ${instance.status} and cannot execute further steps`);
    }
    if (!instance.currentStep) {
      throw new ConflictException('Instance has no current step to complete');
    }

    const openBlocking = await this.prisma.processIncident.count({
      where: { instanceId, companyId, isBlocking: true, status: { in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] as any } },
    });
    if (openBlocking > 0) {
      throw new ConflictException(
        'A blocking incident is open on this instance — resolve it before continuing',
      );
    }

    const step = instance.currentStep;
    if (
      !canRoleExecuteStep(
        step.allowedRoles,
        actor.role,
        actor.permissions?.[`process_step:${step.code}`] === true,
      )
    ) {
      await this.audit(companyId, actor, {
        instanceId,
        definitionId: instance.definitionId,
        versionId: instance.versionId,
        eventType: 'ACCESS_DENIED',
        description: `Role ${actor.role ?? 'UNKNOWN'} attempted step ${step.code} (allowed: ${step.allowedRoles.join(', ') || 'any'})`,
      });
      throw new ForbiddenException(`Your role may not complete step ${step.code}`);
    }

    const evidenceCheck = isMandatoryEvidenceSatisfied(
      step.requiresEvidence,
      step.evidenceSchema,
      dto.evidence,
    );
    if (!evidenceCheck.ok) {
      throw new BadRequestException(
        `Evidence required for ${step.code}: missing ${evidenceCheck.missing.join(', ')}`,
      );
    }

    const ruleCheck = evaluateValidationRules(step.validationRules, dto.result ?? dto.evidence);
    if (!ruleCheck.ok) {
      throw new BadRequestException(
        `Step ${step.code} failed validation: ${ruleCheck.violations.join('; ')}`,
      );
    }

    const now = new Date();
    const stepInstance = await this.prisma.processStepInstance.findFirst({
      where: { instanceId, stepDefinitionId: step.id, status: { in: ['PENDING', 'IN_PROGRESS'] as any } },
      orderBy: { attempt: 'desc' },
    });

    const steps = instance.version.steps;
    const requestedNext = dto.nextStepCode
      ? steps.find((s) => s.code === dto.nextStepCode)
      : undefined;
    if (dto.nextStepCode && !requestedNext) {
      throw new BadRequestException(`No step ${dto.nextStepCode} in version ${instance.version.versionNumber}`);
    }

    const resolvedCode = requestedNext?.code ?? resolveNextStepCode(step, outcome);
    const nextStep = resolvedCode ? steps.find((s) => s.code === resolvedCode) : undefined;
    if (resolvedCode && !nextStep) {
      throw new BadRequestException(`Step ${step.code} points at unknown successor ${resolvedCode}`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (stepInstance) {
        await tx.processStepInstance.update({
          where: { id: stepInstance.id },
          data: {
            status: outcome === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
            completedAt: now,
            evidence: dto.evidence ?? undefined,
            result: dto.result ?? undefined,
            notes: dto.notes ?? null,
          },
        });
      }

      if (outcome !== 'SUCCESS' && !resolvedCode) {
        // A failure/exception with nowhere to go blocks the instance so a human
        // notices instead of the process silently stalling.
        await tx.processInstance.update({
          where: { id: instanceId },
          data: { status: 'BLOCKED', blockedAt: now },
        });
        return;
      }

      if (!nextStep) {
        await tx.processInstance.update({
          where: { id: instanceId },
          data: { status: instance.status === 'BLOCKED' ? 'IN_PROGRESS' : instance.status, currentStepId: null },
        });
        return;
      }

      const loopBack = steps.findIndex((s) => s.code === nextStep.code) <=
        steps.findIndex((s) => s.code === step.code);
      const priorAttempts = await tx.processStepInstance.count({
        where: { instanceId, stepDefinitionId: nextStep.id },
      });

      await tx.processStepInstance.create({
        data: {
          companyId,
          instanceId,
          stepDefinitionId: nextStep.id,
          stepNumber: nextStep.stepNumber,
          code: nextStep.code,
          name: nextStep.name,
          attempt: priorAttempts + 1,
          status: 'IN_PROGRESS',
          startedAt: now,
          executedById: actor.userId ?? null,
          executedByName: actor.name ?? null,
        },
      });

      await tx.processInstance.update({
        where: { id: instanceId },
        data: {
          currentStepId: nextStep.id,
          status: instance.status === 'BLOCKED' ? 'IN_PROGRESS' : 'IN_PROGRESS',
        },
      });

      if (loopBack) {
        this.logger.log(
          `Process instance ${instanceId} re-entered step ${nextStep.code} (attempt ${priorAttempts + 1})`,
        );
      }
    });

    await this.audit(companyId, actor, {
      instanceId,
      definitionId: instance.definitionId,
      versionId: instance.versionId,
      eventType: outcome === 'SUCCESS' ? 'STEP_COMPLETED' : 'STEP_FAILED',
      description: `Step ${step.code} (${outcome})${nextStep ? ` → ${nextStep.code}` : ' → process complete'}`,
      beforeState: { currentStep: step.code, status: instance.status },
      afterState: { nextStep: nextStep?.code ?? null },
      metadata: { hasEvidence: !!dto.evidence, notes: dto.notes ?? null },
    });

    return this.prisma.processInstance.findFirst({
      where: { id: instanceId, companyId },
      include: { currentStep: true, stepInstances: { orderBy: [{ stepNumber: 'asc' }, { attempt: 'asc' }] } },
    });
  }

  // ── Incidents, solutions ──────────────────────────────────────────────────

  async raiseIncident(companyId: string, actor: ActorContext, instanceId: string, dto: any) {
    this.assertEnabled();

    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, companyId },
    });
    if (!instance) throw new NotFoundException('Process instance not found');

    const severity = (dto.severity ?? 'MINOR') as IncidentSeverity;
    const isBlocking = dto.isBlocking ?? severityBlocksProcess(severity);

    const incident = await this.prisma.processIncident.create({
      data: {
        companyId,
        instanceId,
        stepInstanceId: dto.stepInstanceId ?? null,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        severity: severity as any,
        isBlocking,
        evidence: dto.evidence ?? undefined,
        detectedBy: actor.userId ?? 'AUTOMATION',
        status: 'OPEN',
      },
    });

    if (isBlocking) {
      if (!canTransitionInstance(instance.status as ProcessInstanceStatus, 'BLOCKED')) {
        throw new ConflictException(`Cannot block an instance that is ${instance.status}`);
      }
      await this.prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'BLOCKED', blockedAt: new Date() },
      });
    }

    await this.audit(companyId, actor, {
      instanceId,
      definitionId: instance.definitionId,
      versionId: instance.versionId,
      eventType: 'INCIDENT_RAISED',
      description: `${isBlocking ? 'Blocking' : 'Non-blocking'} incident ${dto.code}: ${dto.name}`,
      afterState: { severity, isBlocking },
    });

    return incident;
  }

  async resolveIncident(companyId: string, actor: ActorContext, incidentId: string, dto: any) {
    this.assertEnabled();

    const incident = await this.prisma.processIncident.findFirst({
      where: { id: incidentId, companyId },
      include: { instance: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status === 'RESOLVED') {
      return incident;
    }

    const targetStatus = dto.status ?? 'RESOLVED';
    const now = new Date();

    const updated = await this.prisma.processIncident.update({
      where: { id: incidentId },
      data: {
        status: targetStatus,
        resolution: dto.resolution,
        resolvedById: actor.userId ?? null,
        resolvedByName: actor.name ?? null,
        resolvedAt: targetStatus === 'RESOLVED' ? now : null,
      },
    });

    // Unblock the instance only when no blocking incident remains open.
    if (incident.isBlocking && targetStatus === 'RESOLVED') {
      const stillBlocking = await this.prisma.processIncident.count({
        where: {
          instanceId: incident.instanceId,
          isBlocking: true,
          status: { in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] as any },
        },
      });
      if (stillBlocking === 0 && incident.instance.status === 'BLOCKED') {
        await this.prisma.processInstance.update({
          where: { id: incident.instanceId },
          data: { status: 'IN_PROGRESS', blockedAt: null },
        });
      }
    }

    await this.audit(companyId, actor, {
      instanceId: incident.instanceId,
      definitionId: incident.instance.definitionId,
      versionId: incident.instance.versionId,
      eventType: 'INCIDENT_RESOLVED',
      description: `Incident ${incident.code} → ${targetStatus}: ${dto.resolution}`,
      beforeState: { status: incident.status },
      afterState: { status: targetStatus },
    });

    return updated;
  }

  async proposeSolution(companyId: string, actor: ActorContext, incidentId: string, dto: any) {
    this.assertEnabled();

    const incident = await this.prisma.processIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const solution = await this.prisma.processSolution.create({
      data: {
        companyId,
        incidentId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        proposedById: actor.userId ?? null,
        proposedByName: actor.name ?? null,
        status: 'PROPOSED',
      },
    });

    await this.audit(companyId, actor, {
      instanceId: incident.instanceId,
      eventType: 'SOLUTION_PROPOSED',
      description: `Solution ${dto.code} proposed for incident ${incident.code}`,
    });

    return solution;
  }

  async resolveSolution(companyId: string, actor: ActorContext, solutionId: string, dto: any) {
    this.assertEnabled();

    const solution = await this.prisma.processSolution.findFirst({
      where: { id: solutionId, companyId },
      include: { incident: true },
    });
    if (!solution) throw new NotFoundException('Solution not found');

    const now = new Date();
    const data: any = { status: dto.status };
    if (dto.status === 'APPROVED') {
      data.approvedById = actor.userId ?? null;
      data.approvedAt = now;
    }
    if (dto.status === 'IMPLEMENTED') {
      data.implementedById = actor.userId ?? null;
      data.implementedAt = now;
      data.evidence = dto.evidence ?? undefined;
    }

    const updated = await this.prisma.processSolution.update({ where: { id: solutionId }, data });

    await this.audit(companyId, actor, {
      instanceId: solution.incident.instanceId,
      eventType: dto.status === 'IMPLEMENTED' ? 'SOLUTION_IMPLEMENTED' : 'SOLUTION_APPROVED',
      description: `Solution ${solution.code} → ${dto.status}`,
    });

    return updated;
  }

  // ── Outcome ───────────────────────────────────────────────────────────────

  /**
   * Record the measured outcome of an execution. This is the record that turns
   * a process run into evidence: duration, incidents, first-time-right.
   */
  async recordOutcome(companyId: string, actor: ActorContext, instanceId: string, dto: any) {
    this.assertEnabled();

    const instance = await this.prisma.processInstance.findFirst({
      where: { id: instanceId, companyId },
      include: { version: { include: { steps: true } }, stepInstances: true, incidents: true },
    });
    if (!instance) throw new NotFoundException('Process instance not found');

    const existing = await this.prisma.processOutcome.findUnique({ where: { instanceId } });
    if (existing) return existing;

    const completedStepIds = new Set(
      instance.stepInstances.filter((s) => s.status === 'COMPLETED').map((s) => s.stepDefinitionId),
    );
    const totalSteps = instance.version.steps.length;
    const completedSteps = completedStepIds.size;
    const remainingSteps = Math.max(0, totalSteps - completedSteps);

    const openBlockingIncidentCount = instance.incidents.filter(
      (i) => i.isBlocking && i.status !== 'RESOLVED',
    ).length;
    const blockingIncidentCount = instance.incidents.filter((i) => i.isBlocking).length;

    const gate = canRecordOutcome({
      instanceStatus: instance.status as ProcessInstanceStatus,
      openBlockingIncidentCount,
      remainingSteps,
    });
    if (!gate.ok) throw new ConflictException(`Cannot record outcome: ${gate.reason}`);

    const completedAt = new Date();
    const evaluation = evaluateOutcome({
      totalSteps,
      completedSteps,
      incidentCount: instance.incidents.length,
      blockingIncidentCount,
      openBlockingIncidentCount,
      startedAt: instance.startedAt,
      completedAt,
    });

    const outcome = await this.prisma.$transaction(async (tx) => {
      const created = await tx.processOutcome.create({
        data: {
          companyId,
          instanceId,
          status: (dto.status ?? evaluation.status) as any,
          completedSteps,
          totalSteps,
          incidentCount: instance.incidents.length,
          blockingIncidentCount,
          durationMinutes: evaluation.durationMinutes,
          firstTimeRight: evaluation.firstTimeRight,
          evidence: dto.evidence ?? undefined,
          artifacts: dto.artifacts ?? undefined,
          lessonsLearned: dto.lessonsLearned ?? null,
          completedById: actor.userId ?? null,
          completedByName: actor.name ?? null,
          completedAt,
        },
      });

      await tx.processInstance.update({
        where: { id: instanceId },
        data: { status: 'COMPLETED', completedAt, currentStepId: null },
      });

      return created;
    });

    await this.audit(companyId, actor, {
      instanceId,
      definitionId: instance.definitionId,
      versionId: instance.versionId,
      eventType: 'OUTCOME_RECORDED',
      description: `Outcome recorded: ${outcome.status} in ${evaluation.durationMinutes} min (first time right: ${evaluation.firstTimeRight})`,
      afterState: {
        status: outcome.status,
        firstTimeRight: evaluation.firstTimeRight,
        reasons: evaluation.reasons,
      },
    });

    return outcome;
  }

  // ── Change proposals ──────────────────────────────────────────────────────

  async proposeChange(companyId: string, actor: ActorContext, definitionId: string, dto: any) {
    this.assertEnabled();

    const definition = await this.prisma.processDefinition.findFirst({
      where: { id: definitionId, companyId },
    });
    if (!definition) throw new NotFoundException('Process definition not found');

    const proposal = await this.prisma.processChangeProposal.create({
      data: {
        companyId,
        definitionId,
        outcomeId: dto.outcomeId ?? null,
        incidentId: dto.incidentId ?? null,
        title: dto.title,
        description: dto.description,
        proposedChanges: dto.proposedChanges,
        proposedById: actor.userId ?? null,
        proposedByName: actor.name ?? null,
        status: 'DRAFT',
      },
    });

    await this.audit(companyId, actor, {
      definitionId,
      eventType: 'CHANGE_PROPOSED',
      description: `Change proposed for ${definition.code}: ${dto.title}`,
    });

    return proposal;
  }

  async reviewChange(companyId: string, actor: ActorContext, proposalId: string, dto: any) {
    this.assertEnabled();

    const proposal = await this.prisma.processChangeProposal.findFirst({
      where: { id: proposalId, companyId },
      include: { definition: true },
    });
    if (!proposal) throw new NotFoundException('Change proposal not found');

    if (dto.status === 'APPROVED' || dto.status === 'REJECTED') {
      if (!canApprove(actor)) {
        throw new ForbiddenException('Reviewing a change to a standard requires a manager or admin role');
      }
    }

    const now = new Date();
    const data: any = {
      status: dto.status,
      reviewNotes: dto.reviewNotes ?? null,
      reviewedById: actor.userId ?? null,
      reviewedByName: actor.name ?? null,
      reviewedAt: now,
    };
    if (dto.status === 'IMPLEMENTED') {
      data.implementedInVersionId = dto.implementedInVersionId ?? null;
      data.implementedAt = now;
    }

    const updated = await this.prisma.processChangeProposal.update({
      where: { id: proposalId },
      data,
    });

    await this.audit(companyId, actor, {
      definitionId: proposal.definitionId,
      eventType:
        dto.status === 'APPROVED'
          ? 'CHANGE_APPROVED'
          : dto.status === 'IMPLEMENTED'
            ? 'CHANGE_IMPLEMENTED'
            : 'CHANGE_REVIEWED',
      description: `Change proposal "${proposal.title}" → ${dto.status}`,
    });

    return updated;
  }

  // ── Audit trail ───────────────────────────────────────────────────────────

  async listAuditEvents(companyId: string, filters?: { instanceId?: string; definitionId?: string }) {
    this.assertEnabled();
    return this.prisma.processAuditEvent.findMany({
      where: {
        companyId,
        instanceId: filters?.instanceId,
        definitionId: filters?.definitionId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async audit(
    companyId: string,
    actor: ActorContext,
    event: {
      eventType: string;
      description: string;
      definitionId?: string | null;
      versionId?: string | null;
      instanceId?: string | null;
      beforeState?: Json;
      afterState?: Json;
      metadata?: Json;
    },
  ) {
    try {
      await this.prisma.processAuditEvent.create({
        data: {
          companyId,
          definitionId: event.definitionId ?? null,
          versionId: event.versionId ?? null,
          instanceId: event.instanceId ?? null,
          eventType: event.eventType,
          actorId: actor.userId ?? 'SYSTEM',
          actorName: actor.name ?? null,
          beforeState: event.beforeState as any,
          afterState: event.afterState as any,
          description: event.description,
          metadata: event.metadata as any,
        },
      });
    } catch (err) {
      // The audit trail must never take the operation down with it, but the
      // failure must be loud enough to be caught in review.
      this.logger.error(
        `Failed to write ProcessAuditEvent (${event.eventType}) for company ${companyId}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}

// ── Module-private helpers ──────────────────────────────────────────────────

function versionSummarySelect() {
  return {
    id: true,
    versionNumber: true,
    status: true,
    contentHash: true,
    isImmutable: true,
    approvedAt: true,
    pilotStartedAt: true,
    retiredAt: true,
    createdAt: true,
  } as const;
}

function canApprove(actor: ActorContext): boolean {
  const role = (actor.role ?? '').toUpperCase();
  if (['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'OWNER'].includes(role)) return true;
  return actor.permissions?.['process_book:approve'] === true;
}

/**
 * Structural checks that keep a version internally consistent: unique step
 * numbers, unique codes, and successors that actually exist. Without this the
 * execution engine could hand out a step that can never be reached.
 */
function assertStepsAreWellFormed(
  steps: Array<{ stepNumber?: number; code?: string; nextStepOnSuccess?: string | null; nextStepOnFailure?: string | null; nextStepOnException?: string | null }>,
): void {
  const numbers = new Set<number>();
  const codes = new Set<string>();

  for (const step of steps) {
    if (typeof step.stepNumber !== 'number' || step.stepNumber < 1) {
      throw new BadRequestException('Every step needs a positive stepNumber');
    }
    if (numbers.has(step.stepNumber)) {
      throw new BadRequestException(`Duplicate stepNumber ${step.stepNumber}`);
    }
    numbers.add(step.stepNumber);

    const code = (step.code ?? '').trim();
    if (!code) throw new BadRequestException(`Step ${step.stepNumber} is missing a code`);
    if (codes.has(code)) throw new BadRequestException(`Duplicate step code ${code}`);
    codes.add(code);
  }

  for (const step of steps) {
    for (const target of [step.nextStepOnSuccess, step.nextStepOnFailure, step.nextStepOnException]) {
      if (target && !codes.has(target)) {
        throw new BadRequestException(`Step ${step.code} points at unknown successor ${target}`);
      }
    }
  }
}

export { isProcessControlEnabled };
