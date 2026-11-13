/**
 * Train manifest lifecycle.
 *
 * Every manifest transition in the service funnels through one private
 * `transition` helper, so that helper is the single place the guarantee has to
 * hold: a manifest only moves from the status the caller read, and a caller
 * that loses the race publishes nothing. The train manifest is the document
 * that travels with the consist — a status published twice, or out of order,
 * is a real operational problem downstream.
 *
 * Only the transition guarantee is covered here; the pure rules live in
 * `rail-manifest.rules.spec.ts`.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FakeTable } from '../../test/support/in-memory-db';
import { RailTrainManifestService } from './rail-manifest.service';
import { RailActor } from './rail-audit';

const MANAGER: RailActor = {
  id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: 'MANAGER' as any,
};

function make() {
  const manifests = new FakeTable('mf');
  const wagons = new FakeTable('wag');
  const consignments = new FakeTable('con');
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    withTenant: async (_companyId: string, fn: any, _opts?: any) => fn(prisma),
    railTrainManifest: manifests,
    railManifestWagon: wagons,
    railConsignment: consignments,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const outbox = { enqueue: jest.fn().mockResolvedValue('ob1') };
  const svc = new RailTrainManifestService(prisma as any, billing as any, audit as any, outbox as any);

  const seedManifest = (over: Record<string, any> = {}) =>
    manifests.seed({
      companyId: 'A', manifestNumber: `TM-2026-${manifests.rows.length + 1}`, status: 'ISSUED',
      revision: 1, consignmentId: 'con-1', ...over,
    });

  return { svc, prisma, manifests, wagons, consignments, billing, audit, outbox, seedManifest };
}

afterEach(() => jest.restoreAllMocks());

describe('manifest transitions', () => {
  it('cancels an issued manifest', async () => {
    const { svc, manifests, seedManifest } = make();
    const m = seedManifest({ status: 'ISSUED' });

    await svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER);

    expect(manifests.rows.find((r: any) => r.id === m.id)!.status).toBe('CANCELLED');
  });

  it('constrains the write on the status it read, not on the id alone', async () => {
    const { svc, prisma, seedManifest } = make();
    const m = seedManifest({ status: 'ISSUED' });

    await svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER);

    const call = prisma.railTrainManifest.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: m.id, companyId: 'A', status: 'ISSUED' });
  });

  it('emits no event when another operator moved the manifest first', async () => {
    const { svc, prisma, manifests, seedManifest, outbox, audit } = make();
    const m = seedManifest({ status: 'ISSUED' });

    // Someone else cancelled it after our guard passed.
    const original = prisma.withTenant;
    jest.spyOn(prisma, 'withTenant').mockImplementation(async (c: string, fn: any) => {
      manifests.rows.find((r: any) => r.id === m.id)!.status = 'CANCELLED';
      return original(c, fn);
    });

    await expect(
      svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER),
    ).rejects.toThrow(ConflictException);

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('emits exactly one event on a clean cancel', async () => {
    const { svc, seedManifest, outbox } = make();
    const m = seedManifest({ status: 'ISSUED' });

    await svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER);

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue.mock.calls[0][2]).toBe('rail.manifest.cancelled');
  });

  it('runs the transition inside a tenant context', async () => {
    const { svc, prisma, seedManifest } = make();
    const m = seedManifest({ status: 'ISSUED' });
    const spy = jest.spyOn(prisma, 'withTenant');

    await svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER);

    expect(spy).toHaveBeenCalledWith('A', expect.any(Function));
    spy.mockRestore();
  });

  it('will not cancel another tenant’s manifest', async () => {
    const { svc, seedManifest } = make();
    const m = seedManifest({ companyId: 'B', status: 'ISSUED' });

    await expect(
      svc.cancel('A', m.id, { reason: 'Train cancelled' }, MANAGER),
    ).rejects.toThrow(NotFoundException);
  });
});
