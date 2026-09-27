import {
  GOODS_RECEIPT_INCIDENT_CODES,
  canRecordOutcome,
  canRoleExecuteStep,
  canTransitionInstance,
  canTransitionVersion,
  computeVersionContentHash,
  evaluateOutcome,
  evaluateValidationRules,
  isMandatoryEvidenceSatisfied,
  isProcessControlAllowedInEnv,
  isProcessControlEnabled,
  isVersionEditable,
  isVersionExecutable,
  isVersionImmutable,
  isWmsReceiptBridgeEnabled,
  isWmsReceiptBridgeEnforcing,
  processControlGate,
  resolveNextStepCode,
  severityBlocksProcess,
  stableStringify,
} from './process-control.policy';

describe('Process Control policy', () => {
  describe('version lifecycle', () => {
    it('only lets drafts be edited', () => {
      expect(isVersionEditable('DRAFT')).toBe(true);
      expect(isVersionEditable('PILOT')).toBe(false);
      expect(isVersionEditable('APPROVED')).toBe(false);
      expect(isVersionEditable('RETIRED')).toBe(false);
    });

    it('treats approved and retired versions as immutable', () => {
      expect(isVersionImmutable('APPROVED')).toBe(true);
      expect(isVersionImmutable('RETIRED')).toBe(true);
      expect(isVersionImmutable('DRAFT')).toBe(false);
    });

    it('only executes pilot or approved versions', () => {
      expect(isVersionExecutable('PILOT')).toBe(true);
      expect(isVersionExecutable('APPROVED')).toBe(true);
      expect(isVersionExecutable('DRAFT')).toBe(false);
      expect(isVersionExecutable('RETIRED')).toBe(false);
    });

    it('never allows a retired version to be revived', () => {
      expect(canTransitionVersion('RETIRED', 'DRAFT')).toBe(false);
      expect(canTransitionVersion('RETIRED', 'APPROVED')).toBe(false);
      expect(canTransitionVersion('RETIRED', 'PILOT')).toBe(false);
    });

    it('allows the approved → retired path and rejects a backwards move', () => {
      expect(canTransitionVersion('APPROVED', 'RETIRED')).toBe(true);
      expect(canTransitionVersion('APPROVED', 'DRAFT')).toBe(false);
    });

    it('permits a pilot to fall back to draft for revision', () => {
      expect(canTransitionVersion('PILOT', 'DRAFT')).toBe(true);
    });
  });

  describe('instance lifecycle', () => {
    it('allows blocking and unblocking', () => {
      expect(canTransitionInstance('IN_PROGRESS', 'BLOCKED')).toBe(true);
      expect(canTransitionInstance('BLOCKED', 'IN_PROGRESS')).toBe(true);
    });

    it('will not move a terminal instance again', () => {
      expect(canTransitionInstance('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(canTransitionInstance('ABANDONED', 'IN_PROGRESS')).toBe(false);
      expect(canTransitionInstance('FAILED', 'IN_PROGRESS')).toBe(false);
    });
  });

  describe('incident severity', () => {
    it('stops the line only for blocking or critical severities', () => {
      expect(severityBlocksProcess('BLOCKING')).toBe(true);
      expect(severityBlocksProcess('CRITICAL')).toBe(true);
      expect(severityBlocksProcess('MAJOR')).toBe(false);
      expect(severityBlocksProcess('MINOR')).toBe(false);
    });
  });

  describe('evidence and validation rules', () => {
    it('passes a step that needs no evidence', () => {
      expect(isMandatoryEvidenceSatisfied(false, null, undefined).ok).toBe(true);
    });

    it('lists the missing required evidence fields', () => {
      const result = isMandatoryEvidenceSatisfied(
        true,
        { required: ['countedQty', 'photoKey'] },
        { countedQty: 10 },
      );
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(['photoKey']);
    });

    it('refuses empty evidence when a step demands evidence but declares no schema', () => {
      const result = isMandatoryEvidenceSatisfied(true, null, {});
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(['<evidence>']);
    });

    it('treats blank strings and empty arrays as missing', () => {
      const result = isMandatoryEvidenceSatisfied(true, { required: ['photoKey', 'codes'] }, {
        photoKey: '   ',
        codes: [],
      });
      expect(result.missing).toEqual(['photoKey', 'codes']);
    });

    it('enforces non-negative and positive numeric rules', () => {
      expect(evaluateValidationRules({ nonNegative: ['countedQty'] }, { countedQty: -1 }).ok).toBe(false);
      expect(evaluateValidationRules({ positive: ['countedQty'] }, { countedQty: 0 }).ok).toBe(false);
      expect(evaluateValidationRules({ positive: ['countedQty'] }, { countedQty: 1 }).ok).toBe(true);
    });

    it('enforces equality between fields', () => {
      const result = evaluateValidationRules(
        { equals: { receivedQty: 'expectedQty' } },
        { receivedQty: 98, expectedQty: 100 },
      );
      expect(result.ok).toBe(false);
      expect(result.violations[0]).toContain('receivedQty must equal expectedQty');
    });

    it('flags variance beyond a percentage ceiling', () => {
      const result = evaluateValidationRules(
        { maxVariancePct: { field: 'countedQty', reference: 'expectedQty', pct: 2 } },
        { countedQty: 95, expectedQty: 100 },
      );
      expect(result.ok).toBe(false);
      expect(result.violations[0]).toContain('5.00%');
    });

    it('ignores rules for fields the caller did not supply', () => {
      expect(evaluateValidationRules({ nonNegative: ['countedQty'] }, {}).ok).toBe(true);
    });
  });

  describe('step transitions', () => {
    const step = {
      code: 'INSPECT',
      nextStepOnSuccess: 'PUT_AWAY',
      nextStepOnFailure: 'QUARANTINE',
      nextStepOnException: 'ESCALATE',
    };

    it('picks the successor that matches the outcome', () => {
      expect(resolveNextStepCode(step, 'SUCCESS')).toBe('PUT_AWAY');
      expect(resolveNextStepCode(step, 'FAILURE')).toBe('QUARANTINE');
      expect(resolveNextStepCode(step, 'EXCEPTION')).toBe('ESCALATE');
    });

    it('returns null when no successor is configured', () => {
      expect(resolveNextStepCode({ code: 'LAST' }, 'SUCCESS')).toBeNull();
      expect(resolveNextStepCode({ code: 'LAST', nextStepOnSuccess: '  ' }, 'SUCCESS')).toBeNull();
    });
  });

  describe('step authorisation', () => {
    it('lets any operator run an unrestricted step', () => {
      expect(canRoleExecuteStep([], 'WAREHOUSE')).toBe(true);
      expect(canRoleExecuteStep(null, 'WAREHOUSE')).toBe(true);
    });

    it('restricts a step to its declared roles', () => {
      expect(canRoleExecuteStep(['MANAGER'], 'WAREHOUSE')).toBe(false);
      expect(canRoleExecuteStep(['MANAGER', 'WAREHOUSE'], 'WAREHOUSE')).toBe(true);
    });

    it('honours an explicit per-user permission override', () => {
      expect(canRoleExecuteStep(['MANAGER'], 'WAREHOUSE', true)).toBe(true);
    });
  });

  describe('outcome evaluation', () => {
    const base = {
      totalSteps: 5,
      completedSteps: 5,
      incidentCount: 0,
      blockingIncidentCount: 0,
      openBlockingIncidentCount: 0,
      startedAt: new Date('2026-09-26T08:00:00Z'),
      completedAt: new Date('2026-09-26T08:45:00Z'),
    };

    it('marks a clean run first-time-right', () => {
      const outcome = evaluateOutcome(base);
      expect(outcome.status).toBe('COMPLETED');
      expect(outcome.firstTimeRight).toBe(true);
      expect(outcome.durationMinutes).toBe(45);
    });

    it('does not call a run with resolved exceptions first-time-right', () => {
      const outcome = evaluateOutcome({ ...base, incidentCount: 2, blockingIncidentCount: 1 });
      expect(outcome.status).toBe('COMPLETED_WITH_EXCEPTIONS');
      expect(outcome.firstTimeRight).toBe(false);
      expect(outcome.reasons).toContain('2 incident(s) recorded');
    });

    it('never returns a negative duration', () => {
      const outcome = evaluateOutcome({
        ...base,
        startedAt: new Date('2026-09-26T09:00:00Z'),
        completedAt: new Date('2026-09-26T08:00:00Z'),
      });
      expect(outcome.durationMinutes).toBe(0);
    });

    it('refuses to close out an instance with open blocking incidents or open steps', () => {
      expect(
        canRecordOutcome({
          instanceStatus: 'IN_PROGRESS',
          openBlockingIncidentCount: 1,
          remainingSteps: 3,
        }).reason,
      ).toContain('blocking incident');
      expect(
        canRecordOutcome({
          instanceStatus: 'IN_PROGRESS',
          openBlockingIncidentCount: 0,
          remainingSteps: 2,
        }).reason,
      ).toContain('2 step(s) still open');
      expect(
        canRecordOutcome({
          instanceStatus: 'COMPLETED',
          openBlockingIncidentCount: 0,
          remainingSteps: 0,
        }).ok,
      ).toBe(false);
    });

    it('allows closing a completed run with no open work', () => {
      expect(
        canRecordOutcome({
          instanceStatus: 'IN_PROGRESS',
          openBlockingIncidentCount: 0,
          remainingSteps: 0,
        }).ok,
      ).toBe(true);
    });
  });

  describe('content hashing', () => {
    it('is stable regardless of key order', () => {
      expect(stableStringify({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
        stableStringify({ b: [2, { c: 3, d: 4 }], a: 1 }),
      );
    });

    it('produces the same hash for the same standard', () => {
      const steps = [
        { stepNumber: 1, code: 'VERIFY_SKU', validationRules: { positive: ['expectedQty'] } },
        { stepNumber: 2, code: 'PUT_AWAY' },
      ];
      expect(computeVersionContentHash(steps)).toBe(computeVersionContentHash([...steps]));
    });

    it('produces a different hash when a rule changes', () => {
      const a = computeVersionContentHash([{ stepNumber: 1, code: 'X' }]);
      const b = computeVersionContentHash([{ stepNumber: 1, code: 'X', slaMinutes: 30 }]);
      expect(a).not.toBe(b);
    });
  });

  describe('feature gates', () => {
    it('is off by default', () => {
      expect(isProcessControlEnabled({})).toBe(false);
      expect(isWmsReceiptBridgeEnabled({})).toBe(false);
      expect(isWmsReceiptBridgeEnforcing({})).toBe(false);
    });

    it('requires both the master flag and the bridge flag for the WMS bridge', () => {
      expect(
        isWmsReceiptBridgeEnabled({ PROCESS_CONTROL_WMS_RECEIPT_ENABLED: 'true' }),
      ).toBe(false);
      expect(
        isWmsReceiptBridgeEnabled({
          PROCESS_CONTROL_ENABLED: 'true',
          PROCESS_CONTROL_WMS_RECEIPT_ENABLED: 'true',
        }),
      ).toBe(true);
    });

    it('fails closed in production even when the flag is set', () => {
      const env = { NODE_ENV: 'production', PROCESS_CONTROL_ENABLED: 'true' };
      expect(isProcessControlAllowedInEnv(env)).toBe(false);
      expect(processControlGate(env).allowed).toBe(false);
      expect(processControlGate(env).reason).toContain('disabled in production');
      expect(processControlGate({ ...env, PROCESS_CONTROL_PRODUCTION_ALLOWED: 'true' }).allowed).toBe(
        true,
      );
    });

    it('explains why it is refusing in a non-production environment', () => {
      const gate = processControlGate({ NODE_ENV: 'development' });
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('PROCESS_CONTROL_ENABLED');
      expect(processControlGate({ NODE_ENV: 'development', PROCESS_CONTROL_ENABLED: 'true' }).allowed).toBe(
        true,
      );
    });
  });

  it('names the goods-receipt incident codes the bridge relies on', () => {
    expect(Object.values(GOODS_RECEIPT_INCIDENT_CODES)).toEqual([
      'QUANTITY_VARIANCE',
      'DAMAGED_GOODS',
      'PUT_AWAY_MISSING',
      'UNKNOWN_SKU',
    ]);
  });
});
