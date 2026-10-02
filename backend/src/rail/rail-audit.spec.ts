/**
 * The rail audit helpers. `recordRailAudit` is what every rail service calls, so its two promises are pinned:
 * it hands back the audit_logs row id (Wave 3: occurrence reports link to it), and it can never break the action —
 * whether the AuditService misbehaves or a test double resolves `undefined` (the shape every older mock has).
 */
import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit,
} from './rail-audit';

const ACTOR: RailActor = { id: 'u1', email: 'mia@toc.co.za', name: 'Mia', role: UserRole.MANAGER };
const logger = () => ({ warn: jest.fn() }) as unknown as Logger & { warn: jest.Mock };
const entry = railAuditEntry('A', ACTOR, 'x.y', { type: 't', id: 'i' });

describe('recordRailAudit', () => {
  it('returns the id that AuditService.record produced', async () => {
    await expect(recordRailAudit({ record: jest.fn().mockResolvedValue('log-42') } as any, logger(), entry)).resolves.toBe('log-42');
  });

  it('passes the entry through unchanged', async () => {
    const record = jest.fn().mockResolvedValue('x');
    await recordRailAudit({ record } as any, logger(), entry);
    expect(record).toHaveBeenCalledWith(entry);
  });

  it.each([[undefined], [null]])('is compatible with an older mock / driver that resolves %p → null', async (value) => {
    await expect(recordRailAudit({ record: jest.fn().mockResolvedValue(value) } as any, logger(), entry)).resolves.toBeNull();
  });

  it('swallows a rejection, warns with the action name, and returns null', async () => {
    const l = logger();
    await expect(recordRailAudit({ record: jest.fn().mockRejectedValue(new Error('boom')) } as any, l, entry)).resolves.toBeNull();
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining('Rail audit write failed for x.y'));
  });

  it('swallows a synchronous throw too', async () => {
    const throwing = { record: () => { throw new Error('sync boom'); } };
    await expect(recordRailAudit(throwing as any, logger(), entry)).resolves.toBeNull();
  });
});

describe('railAuditEntry (a person did it)', () => {
  it('attributes the entry to the tenant user and carries the tenant + role in metadata', () => {
    expect(railAuditEntry('co-1', ACTOR, RAIL_AUDIT_ACTION.CHANGE_CREATED, { type: RAIL_AUDIT_TARGET.CHANGE_REQUEST, id: 'cr-1', name: 'CR-2026-00001' }, { kind: 'CANCEL' })).toEqual({
      action: 'change_request.created', actorType: 'tenant', actorId: 'u1', actorEmail: 'mia@toc.co.za', targetType: 'rail_change_request', targetId: 'cr-1', targetName: 'CR-2026-00001',
      metadata: { module: 'rail', companyId: 'co-1', actorRole: 'MANAGER', kind: 'CANCEL' },
    });
  });

  it('a missing target name is null, not undefined', () => {
    expect(railAuditEntry('A', ACTOR, 'a', { type: 't', id: 'i' }).targetName).toBeNull();
  });

  it('caller metadata can add to the entry, but can NEVER override the tenant, module or role the diagnostics endpoint filters on', () => {
    // The tenant-scoped diagnostics endpoint selects audit rows by metadata.companyId; a spread-last caller could forge it.
    const e = railAuditEntry('A', ACTOR, 'a', { type: 't', id: 'i' }, { extra: 1, companyId: 'EVIL', module: 'billing', actorRole: 'OWNER' });
    expect(e.actorType).toBe('tenant');
    expect(e.actorId).toBe('u1');
    expect(e.metadata).toMatchObject({ module: 'rail', companyId: 'A', actorRole: 'MANAGER', extra: 1 });
  });
});

describe('railSystemAuditEntry (the platform did it — cron sweeps, time-based escalation)', () => {
  it('has no actor and says so', () => {
    expect(railSystemAuditEntry('co-1', RAIL_AUDIT_ACTION.POSSESSION_ACTIVATED, { type: RAIL_AUDIT_TARGET.POSSESSION, id: 'pw-1', name: 'Rail renewal' }, { from: 'PLANNED', to: 'ACTIVE' })).toEqual({
      action: 'possession.activated', actorType: 'system', actorId: null, actorEmail: null, targetType: 'rail_possession_window', targetId: 'pw-1', targetName: 'Rail renewal',
      metadata: { module: 'rail', companyId: 'co-1', from: 'PLANNED', to: 'ACTIVE' },
    });
  });
});

describe('the audit vocabulary', () => {
  it('every action name is unique (two actions sharing a name would be indistinguishable in audit_logs)', () => {
    const names = Object.values(RAIL_AUDIT_ACTION);
    expect(new Set(names).size).toBe(names.length);
  });
  it('every target type is unique and rail-prefixed', () => {
    const targets = Object.values(RAIL_AUDIT_TARGET);
    expect(new Set(targets).size).toBe(targets.length);
    for (const t of targets) expect(t).toMatch(/^rail_/);
  });
  it('the Wave 3 actions are present, including the dispatch-blocked one the DG gate writes', () => {
    expect(RAIL_AUDIT_ACTION.CONSIGNMENT_DISPATCH_BLOCKED).toBe('consignment.dispatch_blocked');
    expect(RAIL_AUDIT_ACTION.OCCURRENCE_REPORTED).toBe('occurrence.reported');
    expect(RAIL_AUDIT_ACTION.CHANGE_PARTY_ALLOCATED).toBe('change_request.party_allocated');
    expect(RAIL_AUDIT_ACTION.POSSESSION_CONFLICT_DETECTED).toBe('possession.conflict_detected');
  });
});
