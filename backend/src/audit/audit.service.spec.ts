/**
 * AuditService is best-effort by design: a logging problem must never break the business action. Wave 3 made `record`
 * return the id of the audit_logs row (so an occurrence report can point at it) — `null` means "the write failed".
 */
import { Logger } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RAIL_AUDIT_ACTION, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit } from '../rail/rail-audit';
import { UserRole } from '@prisma/client';

const make = (create: jest.Mock) => new AuditService({ auditLog: { create } } as any);

afterEach(() => jest.restoreAllMocks());

describe('AuditService.record', () => {
  it('returns the id of the audit_logs row it wrote', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'al-123' });
    await expect(make(create).record({ action: 'x.y' })).resolves.toBe('al-123');
  });

  it('writes every field it was given, and defaults the rest (owner actor, nulls)', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'al-1' });
    await make(create).record({
      action: 'rail.test', actorType: 'tenant', actorId: 'u1', actorEmail: 'a@b.co', targetType: 'rail_occurrence_report', targetId: 'o1', targetName: 'OR-1',
      metadata: { companyId: 'A' }, ip: '10.0.0.1',
    });
    await make(create).record({ action: 'bare' });
    expect(create.mock.calls[0][0].data).toEqual({
      action: 'rail.test', actorType: 'tenant', actorId: 'u1', actorEmail: 'a@b.co', targetType: 'rail_occurrence_report', targetId: 'o1', targetName: 'OR-1',
      metadata: { companyId: 'A' }, ip: '10.0.0.1',
    });
    expect(create.mock.calls[1][0].data).toEqual({
      action: 'bare', actorType: 'owner', actorId: null, actorEmail: null, targetType: null, targetId: null, targetName: null, metadata: undefined, ip: null,
    });
  });

  it('returns null — and does not throw — when the write fails, logging a warning', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));
    await expect(make(create).record({ action: 'x.y' })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to write audit log for x.y'));
  });

  it('returns null when the database answers without a row or id', async () => {
    await expect(make(jest.fn().mockResolvedValue(undefined)).record({ action: 'a' })).resolves.toBeNull();
    await expect(make(jest.fn().mockResolvedValue({})).record({ action: 'a' })).resolves.toBeNull();
    await expect(make(jest.fn().mockResolvedValue({ id: null })).record({ action: 'a' })).resolves.toBeNull();
  });
});

describe('recordRailAudit — the rail module\'s wrapper', () => {
  const logger = new Logger('test');
  const actor: RailActor = { id: 'u1', email: 'u1@toc.co.za', name: 'U One', role: UserRole.MANAGER };
  const entry = railAuditEntry('A', actor, RAIL_AUDIT_ACTION.OCCURRENCE_REPORTED, { type: 'rail_occurrence_report', id: 'o1', name: 'OR-1' }, { k: 'v' });

  it('passes the id through', async () => {
    await expect(recordRailAudit({ record: jest.fn().mockResolvedValue('al-9') } as any, logger, entry)).resolves.toBe('al-9');
  });

  it('Wave 1 / 2 specs mock `record` as resolving undefined — that must read as "no id" (null), not undefined', async () => {
    await expect(recordRailAudit({ record: jest.fn().mockResolvedValue(undefined) } as any, logger, entry)).resolves.toBeNull();
  });

  it('a service that returns null (write failed) reads as null', async () => {
    await expect(recordRailAudit({ record: jest.fn().mockResolvedValue(null) } as any, logger, entry)).resolves.toBeNull();
  });

  it('a misbehaving implementation that THROWS is contained: null, and a warning naming the action', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await expect(recordRailAudit({ record: jest.fn().mockRejectedValue(new Error('boom')) } as any, logger, entry)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('occurrence.reported'));
  });
});

describe('rail audit entries', () => {
  const actor: RailActor = { id: 'u1', email: 'u1@toc.co.za', name: 'U One', role: UserRole.DISPATCH };

  it('a tenant entry carries the actor, role and tenant (AuditLog has no tenant column, so it lives in metadata)', () => {
    expect(railAuditEntry('A', actor, 'consignment.created', { type: 'rail_consignment', id: 'c1', name: 'RAIL-1' }, { tonnage: 5 })).toEqual({
      action: 'consignment.created', actorType: 'tenant', actorId: 'u1', actorEmail: 'u1@toc.co.za', targetType: 'rail_consignment', targetId: 'c1', targetName: 'RAIL-1',
      metadata: { module: 'rail', companyId: 'A', actorRole: 'DISPATCH', tonnage: 5 },
    });
  });

  it('metadata the caller passes can NEVER overwrite the tenant, module or actor role (the diagnostics endpoint scopes audit rows by metadata.companyId)', () => {
    const e = railAuditEntry('A', actor, 'x', { type: 't', id: 'i' }, { companyId: 'EVIL', module: 'fake', actorRole: 'ADMIN', extra: 1 });
    expect(e.metadata).toEqual({ module: 'rail', companyId: 'A', actorRole: 'DISPATCH', extra: 1 });
    const sys = railSystemAuditEntry('A', 'x', { type: 't', id: 'i' }, { companyId: 'EVIL', module: 'fake', extra: 2 });
    expect(sys.metadata).toEqual({ module: 'rail', companyId: 'A', extra: 2 });
  });

  it('a system entry has no actor (cron sweeps)', () => {
    expect(railSystemAuditEntry('A', 'possession.activated', { type: 'rail_possession_window', id: 'p1', name: 'W' }, { from: 'PLANNED', to: 'ACTIVE' })).toEqual({
      action: 'possession.activated', actorType: 'system', actorId: null, actorEmail: null, targetType: 'rail_possession_window', targetId: 'p1', targetName: 'W',
      metadata: { module: 'rail', companyId: 'A', from: 'PLANNED', to: 'ACTIVE' },
    });
  });
});
