import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakePrisma } from '../testing/fake-prisma';
import { ProcessControlService, type ActorContext } from './process-control.service';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';

const warehouseUser: ActorContext = {
  userId: 'user-1',
  name: 'Dock Clerk',
  role: 'WAREHOUSE',
  permissions: null,
};

const manager: ActorContext = {
  userId: 'user-2',
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

/**
 * These are service-level tests against an in-memory Prisma double — the
 * sandbox has no PostgreSQL. They cover the behaviour that has to be right
 * before the capability goes anywhere near a warehouse: tenant isolation,
 * business-key idempotency, approved-version immutability, evidence gating,
 * blocking incidents and outcome rules. The database-backed integration suite
 * (row locks, real UniqueConstraintError, cascade behaviour) is still required
 * before production and is listed as an open gate.
 */
describe('ProcessControlService', () => {
  let prisma: FakePrisma;
  let service: ProcessControlService;

  beforeEach(() => {
    process.env.PROCESS_CONTROL_ENABLED = 'true';
    delete process.env.PROCESS_CONTROL_PRODUCTION_ALLOWED;
    process.env.NODE_ENV = 'test';
    prisma = new FakePrisma();
    service = new ProcessControlService(prisma as any);
  });

  afterEach(() => {
    delete process.env.PROCESS_CONTROL_ENABLED;
  });

  async function approvedDefinition(companyId = COMPANY_A, actor: ActorContext = manager) {
    const definition = await service.createDefinition(companyId, actor, {
      code: 'WMS.GOODS_RECEIPT',
      name: 'Goods receipt',
    });
    const version = await service.createVersion(companyId, actor, definition.id, { steps: STEPS });
    await service.transitionVersion(companyId, actor, version.id, 'APPROVED');
    return { definition, version };
  }

  describe('feature gate', () => {
    it('refuses every operation while the capability is disabled', async () => {
      delete process.env.PROCESS_CONTROL_ENABLED;
      await expect(service.listDefinitions(COMPANY_A)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.createDefinition(COMPANY_A, manager, { code: 'X.Y', name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses in production even when the flag is set', async () => {
      process.env.NODE_ENV = 'production';
      await expect(service.listDefinitions(COMPANY_A)).rejects.toThrow(/disabled in production/);
      process.env.NODE_ENV = 'test';
    });
  });

  describe('definitions and versions', () => {
    it('is idempotent when the same SOP key is created twice in one tenant', async () => {
      const first = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      const second = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      expect(second.id).toBe(first.id);
      expect(prisma.all('processDefinition')).toHaveLength(1);
    });

    it('allocates sequential version numbers per definition', async () => {
      const { definition } = await approvedDefinition();
      const v2 = await service.createVersion(COMPANY_A, manager, definition.id, { steps: STEPS });
      expect(v2.versionNumber).toBe(2);
    });

    it('refuses a version whose steps point at unknown successors', async () => {
      const definition = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      await expect(
        service.createVersion(COMPANY_A, manager, definition.id, {
          steps: [{ stepNumber: 1, code: 'A', name: 'A', nextStepOnSuccess: 'NOPE' }],
        }),
      ).rejects.toThrow(/unknown successor/);
    });

    it('refuses duplicate step codes and numbers', async () => {
      const definition = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      await expect(
        service.createVersion(COMPANY_A, manager, definition.id, {
          steps: [
            { stepNumber: 1, code: 'A', name: 'A' },
            { stepNumber: 1, code: 'B', name: 'B' },
          ],
        }),
      ).rejects.toThrow(/Duplicate stepNumber/);
      await expect(
        service.createVersion(COMPANY_A, manager, definition.id, {
          steps: [
            { stepNumber: 1, code: 'A', name: 'A' },
            { stepNumber: 2, code: 'A', name: 'A again' },
          ],
        }),
      ).rejects.toThrow(/Duplicate step code/);
    });

    it('records a content hash that changes when the standard changes', async () => {
      const definition = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      const v1 = await service.createVersion(COMPANY_A, manager, definition.id, { steps: STEPS });
      const v2 = await service.createVersion(COMPANY_A, manager, definition.id, {
        steps: [...STEPS, { stepNumber: 4, code: 'RECORD_OUTCOME', name: 'Record outcome' }],
      });
      expect(v1.contentHash).not.toBe(v2.contentHash);
      expect(v1.contentHash).toHaveLength(64);
    });

    it('refuses to edit an approved version', async () => {
      const { version } = await approvedDefinition();
      await expect(
        service.updateVersionSteps(COMPANY_A, manager, version.id, { steps: STEPS }),
      ).rejects.toThrow(/cannot be edited/);
    });

    it('requires an approval role to approve a standard and audits the refusal', async () => {
      const definition = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.GR', name: 'Goods receipt' });
      const version = await service.createVersion(COMPANY_A, manager, definition.id, { steps: STEPS });

      await expect(
        service.transitionVersion(COMPANY_A, warehouseUser, version.id, 'APPROVED'),
      ).rejects.toThrow(/manager or admin/);

      const denied = prisma.all('processAuditEvent').find((e) => e.eventType === 'ACCESS_DENIED');
      expect(denied).toBeDefined();
    });

    it('makes an approved version the definition’s current standard', async () => {
      const { definition, version } = await approvedDefinition();
      const reloaded = await service.getDefinition(COMPANY_A, definition.id);
      expect(reloaded.currentVersionId).toBe(version.id);
    });

    it('does not let one tenant approve another tenant’s version', async () => {
      const { version } = await approvedDefinition(COMPANY_A);
      await expect(
        service.transitionVersion(COMPANY_B, manager, version.id, 'RETIRED'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('instance execution', () => {
    it('is idempotent on the business key', async () => {
      await approvedDefinition();
      const first = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00001',
      });
      const replay = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00001',
      });
      expect(replay!.id).toBe(first!.id);
      expect(prisma.all('processInstance')).toHaveLength(1);
    });

    it('opens the first step on a new instance', async () => {
      await approvedDefinition();
      const instance = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00002',
      });
      const step = prisma.all('processStepInstance')[0];
      expect(step.code).toBe('VERIFY_SKU');
      expect(step.status).toBe('IN_PROGRESS');
      expect(instance!.currentStepId).toBeDefined();
    });

    it('will not execute a draft standard', async () => {
      const definition = await service.createDefinition(COMPANY_A, manager, { code: 'WMS.DRAFT', name: 'Draft' });
      await service.createVersion(COMPANY_A, manager, definition.id, { steps: STEPS });
      await expect(
        service.startInstance(COMPANY_A, warehouseUser, {
          definitionCode: 'WMS.DRAFT',
          businessKey: 'X-1',
        }),
      ).rejects.toThrow(/no approved or pilot version/);
    });

    it('refuses a step when required evidence is missing', async () => {
      await approvedDefinition();
      const instance = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00003',
      });
      await expect(
        service.completeStep(COMPANY_A, warehouseUser, instance!.id, 'SUCCESS', { result: {} }),
      ).rejects.toThrow(/Evidence required/);
    });

    it('advances to the configured successor once the step is satisfied', async () => {
      await approvedDefinition();
      const instance = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00004',
      });
      const updated = await service.completeStep(COMPANY_A, warehouseUser, instance!.id, 'SUCCESS', {
        evidence: { lines: ['SKU-00001'] },
      });
      expect(updated!.currentStep!.code).toBe('INSPECT_QUANTITY');
    });

    it('enforces role restrictions on a step', async () => {
      await approvedDefinition();
      const instance = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00005',
      });
      await service.completeStep(COMPANY_A, warehouseUser, instance!.id, 'SUCCESS', {
        evidence: { lines: ['SKU-00001'] },
      });

      await expect(
        service.completeStep(COMPANY_A, { userId: 'viewer', role: 'VIEWER' }, instance!.id, 'SUCCESS', {
          evidence: { countedQty: 10 },
        }),
      ).rejects.toThrow(/may not complete step/);
    });

    it('refuses a tenant operating on another tenant’s instance', async () => {
      await approvedDefinition();
      const instance = await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-2026-00006',
      });
      await expect(
        service.completeStep(COMPANY_B, warehouseUser, instance!.id, 'SUCCESS', {
          evidence: { lines: ['x'] },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('incidents', () => {
    async function runningInstance(businessKey: string) {
      await approvedDefinition();
      return (await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey,
      }))!;
    }

    it('blocks the instance for a blocking incident and refuses further steps', async () => {
      const instance = await runningInstance('GR-B-1');
      await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'QUANTITY_VARIANCE',
        name: 'Short delivery',
        severity: 'BLOCKING',
      });

      expect(prisma.all('processInstance')[0].status).toBe('BLOCKED');
      await expect(
        service.completeStep(COMPANY_A, warehouseUser, instance.id, 'SUCCESS', {
          evidence: { lines: ['SKU-1'] },
        }),
      ).rejects.toThrow(/blocking incident is open/);
    });

    it('does not stop the process for a non-blocking incident', async () => {
      const instance = await runningInstance('GR-B-2');
      await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'DAMAGED_GOODS',
        name: 'Damaged units',
        severity: 'MAJOR',
      });
      expect(prisma.all('processInstance')[0].status).toBe('IN_PROGRESS');
    });

    it('unblocks the instance once the blocking incident is resolved', async () => {
      const instance = await runningInstance('GR-B-3');
      const incident = await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'Put away completed and bin scanned',
      });
      expect(prisma.all('processInstance')[0].status).toBe('IN_PROGRESS');
    });

    it('stays blocked while another blocking incident is still open', async () => {
      const instance = await runningInstance('GR-B-4');
      const first = await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'UNKNOWN_SKU',
        name: 'Unknown SKU',
        severity: 'BLOCKING',
      });
      await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      await service.resolveIncident(COMPANY_A, manager, first.id, { resolution: 'Onboarded the SKU' });
      expect(prisma.all('processInstance')[0].status).toBe('BLOCKED');
    });

    it('will not resolve another tenant’s incident', async () => {
      const instance = await runningInstance('GR-B-5');
      const incident = await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'DAMAGED_GOODS',
        name: 'Damaged',
        severity: 'MINOR',
      });
      await expect(
        service.resolveIncident(COMPANY_B, manager, incident.id, { resolution: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('captures proposed solutions against the incident', async () => {
      const instance = await runningInstance('GR-B-6');
      const incident = await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'QUANTITY_VARIANCE',
        name: 'Short',
        severity: 'MAJOR',
      });
      const solution = await service.proposeSolution(COMPANY_A, warehouseUser, incident.id, {
        code: 'SUPPLIER_RECON',
        name: 'Reconcile with supplier',
        description: 'Confirm the shortfall with the supplier before booking in',
      });
      expect(solution.status).toBe('PROPOSED');
    });
  });

  describe('outcomes and improvement', () => {
    async function runToCompletion(businessKey: string) {
      await approvedDefinition();
      const instance = (await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey,
      }))!;
      await service.completeStep(COMPANY_A, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { lines: ['SKU-1'] },
      });
      await service.completeStep(COMPANY_A, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { countedQty: 100 },
      });
      await service.completeStep(COMPANY_A, warehouseUser, instance.id, 'SUCCESS', {
        evidence: { putAwayBinId: 'bin-1' },
      });
      return instance;
    }

    it('records a first-time-right outcome for a clean run', async () => {
      const instance = await runToCompletion('GR-O-1');
      const outcome = await service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {});
      expect(outcome.status).toBe('COMPLETED');
      expect(outcome.firstTimeRight).toBe(true);
      expect(outcome.completedSteps).toBe(3);
      expect(prisma.all('processInstance')[0].status).toBe('COMPLETED');
    });

    it('does not call a run with incidents first-time-right', async () => {
      const instance = await runToCompletion('GR-O-2');
      await service.raiseIncident(COMPANY_A, warehouseUser, instance.id, {
        code: 'QUANTITY_VARIANCE',
        name: 'Short',
        severity: 'MAJOR',
      });
      const outcome = await service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {});
      expect(outcome.status).toBe('COMPLETED_WITH_EXCEPTIONS');
      expect(outcome.firstTimeRight).toBe(false);
    });

    it('refuses a second outcome for the same instance', async () => {
      const instance = await runToCompletion('GR-O-3');
      await service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {});
      const again = await service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {});
      expect(prisma.all('processOutcome')).toHaveLength(1);
      expect(again).toBeDefined();
    });

    it('refuses to close out an instance with open steps', async () => {
      await approvedDefinition();
      const instance = (await service.startInstance(COMPANY_A, warehouseUser, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'GR-O-4',
      }))!;
      await expect(
        service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires an approval role to accept a change to the standard', async () => {
      const { definition } = await approvedDefinition();
      const proposal = await service.proposeChange(COMPANY_A, warehouseUser, definition.id, {
        title: 'Add supplier reconciliation step',
        description: 'Recurring short deliveries need a reconciliation step',
        proposedChanges: { addSteps: [{ stepNumber: 2, code: 'SUPPLIER_RECON', name: 'Reconcile' }] },
      });

      await expect(
        service.reviewChange(COMPANY_A, warehouseUser, proposal.id, { status: 'APPROVED' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const approved = await service.reviewChange(COMPANY_A, manager, proposal.id, {
        status: 'APPROVED',
        reviewNotes: 'Agreed with ops',
      });
      expect(approved.status).toBe('APPROVED');
    });

    it('keeps an audit trail of every material transition', async () => {
      const instance = await runToCompletion('GR-O-5');
      await service.recordOutcome(COMPANY_A, warehouseUser, instance.id, {});
      const events = prisma.all('processAuditEvent').map((e) => e.eventType);
      expect(events).toEqual(
        expect.arrayContaining(['CREATED', 'VERSION_CREATED', 'VERSION_APPROVED', 'INSTANCE_STARTED', 'OUTCOME_RECORDED']),
      );
    });
  });
});
