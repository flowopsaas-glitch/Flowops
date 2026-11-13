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

  // Regression cover for the finding that completeStep read mutable instance
  // state outside the transaction it wrote in, and then wrote it back
  // unconditionally: two operators completing the same step both advanced the
  // process, and a block landing in between was overwritten with a stale value.
  describe('completeStep — a step may only advance the process once', () => {
    const clerk: ActorContext = {
      userId: 'user-clerk',
      name: 'Dock Clerk',
      role: 'WAREHOUSE',
      permissions: null,
    };

    async function started(key: string) {
      await approvedDefinition();
      return (await service.startInstance(COMPANY_A, clerk, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: key,
      }))!;
    }

    const whereOf = (call: any) => call[0].where;

    // The goods-receipt flow gates each step on evidence, so every call in
    // these tests carries the payload its current step demands.
    const EVIDENCE: Record<string, any> = {
      VERIFY_SKU: { lines: ['SKU-1'] },
      INSPECT_QUANTITY: { countedQty: 100 },
      PUT_AWAY: { putAwayBinId: 'BIN-1' },
    };

    async function completeCurrentStep(instanceId: string, outcome: any = 'SUCCESS') {
      const instance = prisma
        .all('processInstance')
        .find((i: any) => i.id === instanceId) as any;
      const step = prisma
        .all('processStepDefinition')
        .find((d: any) => d.id === instance?.currentStepId) as any;
      return service.completeStep(COMPANY_A, clerk, instanceId, outcome, {
        evidence: EVIDENCE[step?.code] ?? {},
        result: {},
      });
    }

    it('runs the step transition inside a tenant context', async () => {
      const instance = await started('CAS-1');
      const spy = jest.spyOn(prisma, 'withTenant');
      await completeCurrentStep(instance.id);
      expect(spy).toHaveBeenCalledWith(COMPANY_A, expect.any(Function));
      spy.mockRestore();
    });

    it('scopes the step-instance transition to the calling company', async () => {
      const instance = await started('CAS-2');
      const spy = jest.spyOn(prisma.processStepInstance, 'updateMany');
      await completeCurrentStep(instance.id);

      expect(spy).toHaveBeenCalled();
      expect(whereOf(spy.mock.calls[0])).toMatchObject({ companyId: COMPANY_A });
      spy.mockRestore();
    });

    it('constrains the transition on the state it expects, not on the id alone', async () => {
      const instance = await started('CAS-3');
      const spy = jest.spyOn(prisma.processStepInstance, 'updateMany');
      await completeCurrentStep(instance.id);

      // The expected current status is part of the WHERE, so a second operator
      // completing the same step cannot also match.
      expect(whereOf(spy.mock.calls[0]).status).toEqual(
        expect.objectContaining({ in: expect.arrayContaining(['PENDING', 'IN_PROGRESS']) }),
      );
      spy.mockRestore();
    });

    it('refuses when another operator completed the step first', async () => {
      const instance = await started('CAS-4');
      // The row was open when the transaction read it and is not any more: a
      // serialised earlier caller moved it. This call must not advance the
      // process as though it were the one that had.
      const spy = jest
        .spyOn(prisma.processStepInstance, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(completeCurrentStep(instance.id)).rejects.toBeInstanceOf(
        ConflictException,
      );

      spy.mockRestore();
    });

    it('does not advance the process when the step transition loses the race', async () => {
      const instance = await started('CAS-5');
      const spy = jest
        .spyOn(prisma.processStepInstance, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(completeCurrentStep(instance.id)).rejects.toBeInstanceOf(
        ConflictException,
      );

      // The losing caller must leave no trace: no new step created, and the
      // instance still pointing at the step it was on.
      const steps = prisma
        .all('processStepInstance')
        .filter((s: any) => s.instanceId === instance.id);
      expect(steps.filter((s: any) => s.status === 'IN_PROGRESS')).toHaveLength(1);
      spy.mockRestore();
    });

    it('reads the step instance inside the transaction, not before it', async () => {
      const instance = await started('CAS-6');
      const order: string[] = [];

      jest.spyOn(prisma, 'withTenant').mockImplementation(async (_c: string, fn: any) => {
        order.push('open-transaction');
        const result = await fn(prisma);
        order.push('close-transaction');
        return result;
      });
      const findSpy = jest
        .spyOn(prisma.processStepInstance, 'findFirst')
        .mockImplementation(async (..._args: any[]) => {
          order.push('read-step-instance');
          return null;
        });

      await completeCurrentStep(instance.id);

      expect(order[0]).toBe('open-transaction');
      expect(order).toContain('read-step-instance');
      expect(order.indexOf('read-step-instance')).toBeGreaterThan(
        order.indexOf('open-transaction'),
      );
      expect(order.indexOf('read-step-instance')).toBeLessThan(
        order.lastIndexOf('close-transaction'),
      );

      findSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('never writes an instance status it read before the transaction', async () => {
      const instance = await started('CAS-7');
      const spy = jest.spyOn(prisma.processInstance, 'updateMany');
      await completeCurrentStep(instance.id);

      // Guard against the assertion passing only because nothing was written.
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      for (const call of spy.mock.calls) {
        expect(whereOf(call)).toMatchObject({ id: instance.id, companyId: COMPANY_A });
      }
      spy.mockRestore();
    });

    it('advances to the next step exactly once on a clean run', async () => {
      const instance = await started('CAS-8');
      await completeCurrentStep(instance.id);

      const steps = prisma
        .all('processStepInstance')
        .filter((s: any) => s.instanceId === instance.id);
      const inProgress = steps.filter((s: any) => s.status === 'IN_PROGRESS');
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].code).toBe('INSPECT_QUANTITY');
    });

    it('clears the current step when the last step completes', async () => {
      const instance = await started('CAS-9');
      const spy = jest.spyOn(prisma.processInstance, 'updateMany');

      // Walk all three steps of the goods-receipt flow.
      for (let i = 0; i < 3; i += 1) {
        await completeCurrentStep(instance.id);
      }

      const finalWrite = spy.mock.calls[spy.mock.calls.length - 1];
      expect(whereOf(finalWrite)).toMatchObject({ companyId: COMPANY_A });
      expect(((finalWrite[0] as any).data as any).currentStepId).toBeNull();
      spy.mockRestore();

      expect(
        prisma.all('processInstance').find((i: any) => i.id === instance.id)?.status,
      ).toBe('IN_PROGRESS');
    });
  });

  describe('incidents and outcomes — state is only written where it is still true', () => {
    const clerk: ActorContext = {
      userId: 'user-clerk',
      name: 'Dock Clerk',
      role: 'WAREHOUSE',
      permissions: null,
    };

    async function runningInstance(businessKey: string) {
      await approvedDefinition();
      return (await service.startInstance(COMPANY_A, clerk, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey,
      }))!;
    }

    const statusOf = (instanceId: string) =>
      prisma.all('processInstance').find((i: any) => i.id === instanceId)?.status;

    const EVIDENCE: Record<string, any> = {
      VERIFY_SKU: { lines: ['SKU-1'] },
      INSPECT_QUANTITY: { countedQty: 100 },
      PUT_AWAY: { putAwayBinId: 'BIN-1' },
    };

    // Walk the whole goods-receipt flow so an outcome may be recorded.
    async function finishAllSteps(instanceId: string) {
      for (let i = 0; i < 3; i += 1) {
        const live = prisma.all('processInstance').find((x: any) => x.id === instanceId) as any;
        if (!live?.currentStepId) break;
        const def = prisma
          .all('processStepDefinition')
          .find((d: any) => d.id === live.currentStepId) as any;
        await service.completeStep(COMPANY_A, clerk, instanceId, 'SUCCESS', {
          evidence: EVIDENCE[def.code] ?? {},
          result: {},
        });
      }
    }

    it('does not block an instance that moved on while the incident was raised', async () => {
      const instance = await runningInstance('IR-1');
      const spy = jest
        .spyOn(prisma.processInstance, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.raiseIncident(COMPANY_A, clerk, instance.id, {
          code: 'DAMAGED_GOODS',
          name: 'Damaged units',
          severity: 'BLOCKING',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      spy.mockRestore();
    });

    it('blocks on the status it checked, not on the id alone', async () => {
      const instance = await runningInstance('IR-2');
      const spy = jest.spyOn(prisma.processInstance, 'updateMany');

      await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'DAMAGED_GOODS',
        name: 'Damaged units',
        severity: 'BLOCKING',
      });

      const call = spy.mock.calls[spy.mock.calls.length - 1];
      expect((call[0] as any).where).toMatchObject({
        id: instance.id,
        companyId: COMPANY_A,
        status: 'IN_PROGRESS',
      });
      spy.mockRestore();
    });

    it('refuses a second resolution of the same incident', async () => {
      const instance = await runningInstance('IR-3');
      const incident = await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'Put away completed and bin scanned',
      });

      // Re-resolving an already-RESOLVED incident is deliberately idempotent —
      // it returns the existing record without writing over it.
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'A different resolution written by someone else',
      });
      const row = prisma.all('processIncident').find((i: any) => i.id === incident.id) as any;
      expect(row.resolution).toBe('Put away completed and bin scanned');
    });

    it('refuses when another operator moved the incident first', async () => {
      const instance = await runningInstance('IR-3b');
      const incident = await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });

      // The incident was OPEN when this call read it and is not any more:
      // someone escalated it. This call must not stamp a resolution over that.
      const spy = jest
        .spyOn(prisma.processIncident, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.resolveIncident(COMPANY_A, manager, incident.id, {
          resolution: 'Put away completed and bin scanned',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      spy.mockRestore();

      // No resolution may be recorded by a call that lost the race.
      const row = prisma.all('processIncident').find((i: any) => i.id === incident.id) as any;
      expect(row.resolution).toBeFalsy();
    });

    it('scopes the incident update to the calling company', async () => {
      const instance = await runningInstance('IR-4');
      const incident = await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      const spy = jest.spyOn(prisma.processIncident, 'updateMany');
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'Put away completed',
      });
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({ companyId: COMPANY_A });
      spy.mockRestore();
    });

    it('unblocks on another company having open incidents — the count is tenant-scoped', async () => {
      const instance = await runningInstance('IR-5');

      // A second tenant with its own instance and its own unresolved blocking
      // incident. It shares nothing with the instance above.
      await approvedDefinition(COMPANY_B);
      const otherInstance = await service.startInstance(COMPANY_B, clerk, {
        definitionCode: 'WMS.GOODS_RECEIPT',
        businessKey: 'IR-5-B',
      });
      await service.raiseIncident(COMPANY_B, clerk, otherInstance!.id, {
        code: 'UNKNOWN_SKU',
        name: 'Unknown SKU — other tenant',
        severity: 'BLOCKING',
      });

      const incident = await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      expect(statusOf(instance.id)).toBe('BLOCKED');

      const spy = jest.spyOn(prisma.processIncident, 'count');
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'Put away completed and bin scanned',
      });

      const countCall = spy.mock.calls[spy.mock.calls.length - 1];
      expect((countCall[0] as any).where).toMatchObject({ companyId: COMPANY_A });

      // The other tenant's open incident must not hold this instance blocked.
      expect(statusOf(instance.id)).toBe('IN_PROGRESS');
      spy.mockRestore();
    });

    it('unblocks only an instance that is still BLOCKED', async () => {
      const instance = await runningInstance('IR-6');
      const incident = await service.raiseIncident(COMPANY_A, clerk, instance.id, {
        code: 'PUT_AWAY_MISSING',
        name: 'Not put away',
        severity: 'BLOCKING',
      });
      const spy = jest.spyOn(prisma.processInstance, 'updateMany');
      await service.resolveIncident(COMPANY_A, manager, incident.id, {
        resolution: 'Put away completed and bin scanned',
      });

      const unblock = spy.mock.calls[spy.mock.calls.length - 1];
      expect((unblock[0] as any).where).toMatchObject({
        id: instance.id,
        companyId: COMPANY_A,
        status: 'BLOCKED',
      });
      spy.mockRestore();
    });

    it('records the outcome inside a tenant context', async () => {
      const instance = await runningInstance('OR-1');
      await finishAllSteps(instance.id);
      const spy = jest.spyOn(prisma, 'withTenant');
      await service.recordOutcome(COMPANY_A, manager, instance.id, { status: 'COMPLETED' });
      expect(spy).toHaveBeenCalledWith(COMPANY_A, expect.any(Function));
      spy.mockRestore();
    });

    it('does not close over a status change that happened after the gate was evaluated', async () => {
      const instance = await runningInstance('OR-2');
      await finishAllSteps(instance.id);
      const spy = jest
        .spyOn(prisma.processInstance, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.recordOutcome(COMPANY_A, manager, instance.id, { status: 'COMPLETED' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // No outcome row may survive a write that did not happen.
      expect(prisma.all('processOutcome').filter((o: any) => o.instanceId === instance.id)).toHaveLength(0);
      spy.mockRestore();
    });

    it('scopes the duplicate-outcome lookup to the calling company', async () => {
      const instance = await runningInstance('OR-3');
      await finishAllSteps(instance.id);
      const spy = jest.spyOn(prisma.processOutcome, 'findFirst');
      await service.recordOutcome(COMPANY_A, manager, instance.id, { status: 'COMPLETED' });
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({ companyId: COMPANY_A });
      spy.mockRestore();
    });
  });
});
