/**
 * Process Control against a real PostgreSQL.
 *
 * The unit suite (`src/process-control/process-control.service.spec.ts`) runs
 * against an in-memory Prisma double and cannot prove anything about row locks,
 * unique-constraint races or transaction isolation — the double serialises
 * interactive transactions by construction. These tests therefore drive the
 * same service through a real connection pool, where the database decides.
 *
 * Covered here (the §9.3 list in the implementation charter):
 *   • create and approve a version, then read back what was persisted
 *   • invalid lifecycle transitions are refused
 *   • approved versions cannot be edited
 *   • concurrent starts on one business key produce exactly one instance
 *   • steps advance in order, and only through configured successors
 *   • a blocking incident stops completion until it is resolved
 *   • the outcome is only recorded once every required step is complete
 *   • every material transition leaves an audit event
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ProcessControlService,
  type ActorContext,
} from '../../src/process-control/process-control.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { seedTenant, truncateAll } from './support/db';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';

const warehouseUser: ActorContext = {
  userId: 'user-warehouse',
  name: 'Dock Clerk',
  role: 'WAREHOUSE',
  permissions: null,
};

const manager: ActorContext = {
  userId: 'user-manager',
  name: 'Ops Manager',
  role: 'MANAGER',
  permissions: null,
};

const STEPS = [
  {
    stepNumber: 1,
    code: 'VERIFY_SKU',
    name: 'Validate product / variant / SKU',
    requiresEvidence: true,
    evidenceSchema: { required: ['lines'] },
    nextStepOnSuccess: 'INSPECT_QUANTITY',
  },
  {
    stepNumber: 2,
    code: 'INSPECT_QUANTITY',
    name: 'Inspect quantity and condition',
    requiresEvidence: true,
    evidenceSchema: { required: ['countedQty'] },
    validationRules: { nonNegative: ['countedQty'] },
    allowedRoles: ['WAREHOUSE', 'MANAGER'],
    nextStepOnSuccess: 'PUT_AWAY',
  },
  {
    stepNumber: 3,
    code: 'PUT_AWAY',
    name: 'Put away good stock',
    requiresEvidence: true,
    evidenceSchema: { required: ['putAwayBinId'] },
  },
];

jest.setTimeout(60_000);

describe('Process Control (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: ProcessControlService;
  let companyId: string;

  beforeAll(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new ProcessControlService(prisma as unknown as PrismaService);
    // eslint-disable-next-line no-console
    console.log(`[integration] process-control engine: ${db.engine}`);
  });

  afterAll(async () => {
    await db?.shutdown();
  });

  beforeEach(async () => {
    process.env.PROCESS_CONTROL_ENABLED = 'true';
    delete process.env.PROCESS_CONTROL_PRODUCTION_ALLOWED;
    process.env.NODE_ENV = 'test';

    await truncateAll(prisma);
    ({ companyId } = await seedTenant(prisma, 'Process Control Tenant'));
  });

  afterEach(() => {
    delete process.env.PROCESS_CONTROL_ENABLED;
  });

  async function approvedStandard(company = companyId) {
    const definition = await service.createDefinition(company, manager, {
      code: 'WMS.GOODS_RECEIPT',
      name: 'Goods receipt',
    });
    const version = await service.createVersion(company, manager, definition.id, { steps: STEPS });
    await service.transitionVersion(company, manager, version.id, 'APPROVED');
    return { definition, version };
  }

  async function runningInstance(businessKey: string) {
    await approvedStandard();
    return (await service.startInstance(companyId, warehouseUser, {
      definitionCode: 'WMS.GOODS_RECEIPT',
      businessKey,
    }))!;
  }

  describe('standards and versions', () => {
    it('persists an approved version with an immutable content hash and ordered steps', async () => {
      const { definition, version } = await approvedStandard();

      const persisted = await prisma.processVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });

      expect(persisted.status).toBe('APPROVED');
      expect(persisted.contentHash).toHaveLength(64);
      expect(persisted.steps.map((s) => s.code)).toEqual([
        'VERIFY_SKU',
        'INSPECT_QUANTITY',
        'PUT_AWAY',
      ]);

      const reloaded = await service.getDefinition(companyId, definition.id);
      expect(reloaded.currentVersionId).toBe(version.id);
    });

    it('refuses invalid lifecycle transitions', async () => {
      const { version } = await approvedStandard();

      // APPROVED → DRAFT is not a legal move: the standard was signed off.
      await expect(
        service.transitionVersion(companyId, manager, version.id, 'DRAFT'),
      ).rejects.toThrow(/cannot|invalid|transition/i);

      const stillApproved = await prisma.processVersion.findUniqueOrThrow({
        where: { id: version.id },
      });
      expect(stillApproved.status).toBe('APPROVED');

      // APPROVED → RETIRED is legal.
      await service.transitionVersion(companyId, manager, version.id, 'RETIRED');
      // …and RETIRED is terminal.
      await expect(
        service.transitionVersion(companyId, manager, version.id, 'APPROVED'),
      ).rejects.toThrow(/cannot|invalid|transition/i);
    });

    it('refuses to edit an approved version', async () => {
      const { version } = await approvedStandard();

      await expect(
        service.updateVersionSteps(companyId, manager, version.id, {
          steps: [...STEPS, { stepNumber: 4, code: 'SNEAKY', name: 'Edited after approval' }],
        }),
      ).rejects.toThrow(/cannot be edited/);

      const stepCount = await prisma.processStepDefinition.count({ where: { versionId: version.id } });
      expect(stepCount).toBe(STEPS.length);
    });

    it('requires an approval role and records the refusal', async () => {
      const definition = await service.createDefinition(companyId, manager, {
        code: 'WMS.REJECT_TEST',
        name: 'Reject test',
      });
      const version = await service.createVersion(companyId, manager, definition.id, { steps: STEPS });

      await expect(
        service.transitionVersion(companyId, warehouseUser, version.id, 'APPROVED'),
      ).rejects.toThrow(/manager or admin/);

      const denied = await prisma.processAuditEvent.findFirst({
        where: { companyId, eventType: 'ACCESS_DENIED' },
      });
      expect(denied).not.toBeNull();
    });
  });

  describe('instance execution under concurrency', () => {
    it('creates exactly one instance when the same business key is started concurrently', async () => {
      await approvedStandard();

      const attempts = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          service.startInstance(companyId, warehouseUser, {
            definitionCode: 'WMS.GOODS_RECEIPT',
            businessKey: 'GR-CONCURRENT-1',
          }),
        ),
      );

      const rejected = attempts.filter((a) => a.status === 'rejected');
      expect(rejected.map((r) => String((r as PromiseRejectedResult).reason?.message))).toEqual([]);

      const instances = await prisma.processInstance.findMany({
        where: { companyId, businessKey: 'GR-CONCURRENT-1' },
      });
      expect(instances).toHaveLength(1);

      const fulfilled = attempts.filter((a) => a.status === 'fulfilled') as Array<
        PromiseFulfilledResult<{ id: string }>
      >;
      const ids = new Set(fulfilled.map((a) => a.value.id));
      expect(ids.size).toBe(1);

      // Exactly one "started" step instance — no orphaned duplicates.
      const stepInstances = await prisma.processStepInstance.count({
        where: { instanceId: instances[0].id },
      });
      expect(stepInstances).toBe(1);
    });

    it('still starts distinct business keys in parallel', async () => {
      await approvedStandard();

      const [a, b] = await Promise.all([
        service.startInstance(companyId, warehouseUser, {
          definitionCode: 'WMS.GOODS_RECEIPT',
          businessKey: 'GR-PARALLEL-A',
        }),
        service.startInstance(companyId, warehouseUser, {
          definitionCode: 'WMS.GOODS_RECEIPT',
          businessKey: 'GR-PARALLEL-B',
        }),
      ]);

      expect(a!.id).not.toBe(b!.id);
      expect(await prisma.processInstance.count({ where: { companyId } })).toBe(2);
    });

    it('advances only through the configured successor', async () => {
      const instance = await runningInstance('GR-ORDER-1');

      const afterFirst = await service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { lines: ['SKU-00001'] },
      });
      expect(afterFirst!.currentStep!.code).toBe('INSPECT_QUANTITY');

      const afterSecond = await service.completeStep(
        companyId,
        warehouseUser,
        instance.id,
        'SUCCESS',
        { evidence: { countedQty: 100 } },
      );
      expect(afterSecond!.currentStep!.code).toBe('PUT_AWAY');
    });

    it('keeps the step contract: missing evidence and unknown successors are refused', async () => {
      const instance = await runningInstance('GR-ORDER-2');

      await expect(
        service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', { result: {} }),
      ).rejects.toThrow(/Evidence required/);

      await expect(
        service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
          evidence: { lines: ['SKU-00001'] },
          nextStepCode: 'DOES_NOT_EXIST',
        }),
      ).rejects.toThrow(/No step DOES_NOT_EXIST/);

      const still = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance.id } });
      expect(still.currentStepId).toBe(instance.currentStepId);
    });

    it('refuses a step the actor’s role may not execute', async () => {
      const instance = await runningInstance('GR-ROLE-1');
      await service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { lines: ['SKU-00001'] },
      });

      await expect(
        service.completeStep(
          companyId,
          { userId: 'viewer', name: 'Viewer', role: 'VIEWER', permissions: null },
          instance.id,
          'SUCCESS',
          { evidence: { countedQty: 10 } },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a tenant operating on another tenant’s instance', async () => {
      const instance = await runningInstance('GR-TENANT-1');
      const other = await seedTenant(prisma, 'Other Tenant');

      await expect(
        service.completeStep(other.companyId, warehouseUser, instance.id, 'SUCCESS', {
          evidence: { lines: ['SKU-00001'] },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('incidents and blocking', () => {
    it('blocks the instance for a blocking incident and refuses further steps', async () => {
      const instance = await runningInstance('GR-BLOCK-1');

      await service.raiseIncident(companyId, warehouseUser, instance.id, {
        code: 'QUANTITY_VARIANCE',
        name: 'Short delivery',
        severity: 'BLOCKING',
      });

      const blocked = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance.id } });
      expect(blocked.status).toBe('BLOCKED');
      expect(blocked.blockedAt).not.toBeNull();

      await expect(
        service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
          evidence: { lines: ['SKU-00001'] },
        }),
      ).rejects.toThrow(/blocking incident is open/);

      // The incident itself is durable and tenant-scoped.
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { companyId, instanceId: instance.id },
      });
      expect(incident.severity).toBe('BLOCKING');
      expect(incident.isBlocking).toBe(true);
      expect(incident.status).toBe('OPEN');
    });

    it('does not stop the process for a non-blocking incident', async () => {
      const instance = await runningInstance('GR-BLOCK-2');
      await service.raiseIncident(companyId, warehouseUser, instance.id, {
        code: 'DAMAGED_GOODS',
        name: 'Damaged units',
        severity: 'MAJOR',
      });

      const still = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance.id } });
      expect(still.status).toBe('IN_PROGRESS');
    });

    it('unblocks only when no blocking incident remains open', async () => {
      const instance = await runningInstance('GR-BLOCK-3');

      const first = await service.raiseIncident(companyId, warehouseUser, instance.id, {
        code: 'UNKNOWN_SKU',
        name: 'Unknown SKU',
        severity: 'BLOCKING',
      });
      await service.raiseIncident(companyId, warehouseUser, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });

      await service.resolveIncident(companyId, manager, first.id, {
        resolution: 'Master data onboarded',
      });
      const stillBlocked = await prisma.processInstance.findUniqueOrThrow({
        where: { id: instance.id },
      });
      expect(stillBlocked.status).toBe('BLOCKED');

      const open = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance.id, status: { in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] } },
      });
      await service.resolveIncident(companyId, manager, open.id, { resolution: 'Put away completed' });

      const unblocked = await prisma.processInstance.findUniqueOrThrow({
        where: { id: instance.id },
      });
      expect(unblocked.status).toBe('IN_PROGRESS');
    });
  });

  describe('outcomes and audit', () => {
    async function runToCompletion(businessKey: string) {
      const instance = await runningInstance(businessKey);
      await service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { lines: ['SKU-00001'] },
      });
      await service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { countedQty: 100 },
      });
      await service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { putAwayBinId: 'bin-1' },
      });
      return instance;
    }

    it('refuses to record an outcome while required steps are still open', async () => {
      const instance = await runningInstance('GR-OUTCOME-1');

      await expect(
        service.recordOutcome(companyId, warehouseUser, instance.id, {}),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await prisma.processOutcome.count({ where: { instanceId: instance.id } })).toBe(0);
    });

    it('records a first-time-right outcome for a clean run and closes the instance', async () => {
      const instance = await runToCompletion('GR-OUTCOME-2');

      const outcome = await service.recordOutcome(companyId, warehouseUser, instance.id, {
        lessonsLearned: 'Nothing to change',
      });

      expect(outcome.firstTimeRight).toBe(true);
      expect(outcome.status).toBe('COMPLETED');

      const persisted = await prisma.processOutcome.findFirstOrThrow({
        where: { instanceId: instance.id },
      });
      expect(persisted.completedSteps).toBe(3);
      expect(persisted.firstTimeRight).toBe(true);

      const closed = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance.id } });
      expect(closed.status).toBe('COMPLETED');
      expect(closed.currentStepId).toBeNull();

      // A completed instance cannot take further steps.
      await expect(
        service.completeStep(companyId, warehouseUser, instance.id, 'SUCCESS', {
          evidence: { lines: ['x'] },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not call a run with an incident first-time-right', async () => {
      const instance = await runToCompletion('GR-OUTCOME-3');
      await service.raiseIncident(companyId, warehouseUser, instance.id, {
        code: 'QUANTITY_VARIANCE',
        name: 'Short delivery',
        severity: 'MAJOR',
      });

      const outcome = await service.recordOutcome(companyId, warehouseUser, instance.id, {});
      expect(outcome.firstTimeRight).toBe(false);
      expect(outcome.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    });

    it('keeps an audit trail of every material transition', async () => {
      const instance = await runToCompletion('GR-AUDIT-1');
      await service.recordOutcome(companyId, warehouseUser, instance.id, {});

      const events = await prisma.processAuditEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      });
      const types = events.map((e) => e.eventType);

      expect(types).toEqual(
        expect.arrayContaining([
          'CREATED',
          'VERSION_CREATED',
          'VERSION_APPROVED',
          'INSTANCE_STARTED',
          'OUTCOME_RECORDED',
        ]),
      );
      // Audit rows are tenant-scoped and carry an actor.
      expect(events.every((e) => e.companyId === companyId)).toBe(true);
      expect(events.some((e) => e.actorId === warehouseUser.userId)).toBe(true);

      // Step transitions are audited individually, not only the outcome.
      const stepEvents = types.filter((t) => t.includes('STEP'));
      expect(stepEvents.length).toBeGreaterThanOrEqual(3);
    });
  });
});
