/**
 * Telemetry alerts.
 *
 * The alert lifecycle is small — OPEN → ACKNOWLEDGED → RESOLVED — but the
 * published `rail.telemetry.alert_updated` event is what downstream
 * subscribers act on. Two controllers acknowledging the same alert must not
 * both publish, or the same alert goes out twice carrying different
 * timestamps.
 *
 * Only the transition guarantee is covered here; the pure rules live in
 * `rail-telemetry.rules.spec.ts`.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FakeTable } from '../../test/support/in-memory-db';
import { RailTelemetryService } from './rail-telemetry.service';
import { RailActor } from './rail-audit';

const MANAGER: RailActor = {
  id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: 'MANAGER' as any,
};

function make() {
  const alerts = new FakeTable('alert');
  const devices = new FakeTable('dev');
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    withTenant: async (_companyId: string, fn: any, _opts?: any) => fn(prisma),
    railTelemetryAlert: alerts,
    railDevice: devices,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const outbox = { enqueue: jest.fn().mockResolvedValue('ob1') };
  const svc = new RailTelemetryService(prisma as any, billing as any, audit as any, outbox as any);

  const seedAlert = (over: Record<string, any> = {}) =>
    alerts.seed({ companyId: 'A', kind: 'GEOFENCE', status: 'OPEN', ...over });

  return { svc, prisma, alerts, devices, billing, audit, outbox, seedAlert };
}

afterEach(() => jest.restoreAllMocks());

describe('alert transitions', () => {
  it('moves an open alert to acknowledged', async () => {
    const { svc, alerts, seedAlert } = make();
    const a = seedAlert({ status: 'OPEN' });

    await svc.acknowledgeAlert('A', a.id, MANAGER, 'looking into it');

    expect(alerts.rows.find((r: any) => r.id === a.id)!.status).toBe('ACKNOWLEDGED');
  });

  it('constrains the write on the status it read, not on the id alone', async () => {
    const { svc, prisma, seedAlert } = make();
    const a = seedAlert({ status: 'OPEN' });

    await svc.acknowledgeAlert('A', a.id, MANAGER);

    const call = prisma.railTelemetryAlert.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: a.id, companyId: 'A', status: 'OPEN' });
  });

  it('emits no event when another controller acknowledged it first', async () => {
    const { svc, prisma, alerts, seedAlert, outbox, audit } = make();
    const a = seedAlert({ status: 'OPEN' });

    // The other controller's ack lands after our guard passed.
    const original = prisma.withTenant;
    jest.spyOn(prisma, 'withTenant').mockImplementation(async (c: string, fn: any) => {
      alerts.rows.find((r: any) => r.id === a.id)!.status = 'ACKNOWLEDGED';
      return original(c, fn);
    });

    await expect(svc.acknowledgeAlert('A', a.id, MANAGER)).rejects.toThrow(ConflictException);

    expect(outbox.enqueue).not.toHaveBeenCalled();
    // No audit entry either: nobody acknowledged this alert twice.
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('emits exactly one event on a clean acknowledgement', async () => {
    const { svc, seedAlert, outbox } = make();
    const a = seedAlert({ status: 'OPEN' });

    await svc.acknowledgeAlert('A', a.id, MANAGER);

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls[0][2]).toBe('rail.telemetry.alert_updated');
  });

  it('resolves from acknowledged', async () => {
    const { svc, alerts, seedAlert } = make();
    const a = seedAlert({ status: 'ACKNOWLEDGED' });

    await svc.resolveAlert('A', a.id, MANAGER, 'closed out');

    expect(alerts.rows.find((r: any) => r.id === a.id)!.status).toBe('RESOLVED');
  });

  it('will not touch another tenant’s alert', async () => {
    const { svc, seedAlert } = make();
    const a = seedAlert({ companyId: 'B', status: 'OPEN' });

    await expect(svc.acknowledgeAlert('A', a.id, MANAGER)).rejects.toThrow(NotFoundException);
  });
});
