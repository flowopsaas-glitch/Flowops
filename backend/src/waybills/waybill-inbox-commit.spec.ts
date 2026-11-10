import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { WaybillsService } from './waybills.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EcommerceService } from '../ecommerce/ecommerce.service';
import { BillingService } from '../billing/billing.service';
import { EventsGateway } from '../gateway/events.gateway';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import { AuditService } from '../audit/audit.service';

/**
 * Committing an inbox item creates a waybill from a scanned document.
 *
 * The defect this pins: the item was read, the waybill created, and only then
 * was the item written to COMMITTED. Two people committing the same document
 * both read READY and both created a waybill — one invoiceable waybill each,
 * from one piece of paper, with no error anywhere. A pre-check cannot prevent
 * that, because both callers read the same committed row.
 *
 * The fix claims the item (READY -> COMMITTED) before creating anything, so
 * the loser's claim matches zero rows and no second waybill is created.
 */

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if (Array.isArray((v as any).in)) return (v as any).in.includes(row[k]);
      if ('not' in (v as any)) return row[k] !== (v as any).not;
      return true;
    }
    return row[k] === v;
  });
}

class FakeTable {
  rows: Row[] = [];
  seq = 0;
  constructor(private prefix: string) {}
  findFirst = jest.fn(async ({ where }: any = {}) => {
    const r = this.rows.find((x) => matches(x, where));
    return r ? { ...r } : null;
  });
  create = jest.fn(async ({ data }: any) => {
    const row = { id: `${this.prefix}-${++this.seq}`, ...data };
    this.rows.push(row);
    return { ...row };
  });
  update = jest.fn(async ({ where, data }: any) => {
    const r = this.rows.find((x) => matches(x, where));
    Object.assign(r, data);
    return { ...r };
  });
  count = jest.fn(async ({ where }: any = {}) => this.rows.filter((x) => matches(x, where)).length);
  updateMany = jest.fn(async ({ where, data }: any) => {
    const hit = this.rows.filter((x) => matches(x, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  });
}

const TENANT = 'tenant-a';

describe('WaybillsService.commitInboxItem', () => {
  let svc: WaybillsService;
  let inbox: FakeTable;
  let waybills: FakeTable;

  beforeEach(async () => {
    inbox = new FakeTable('inbox');
    waybills = new FakeTable('wb');

    const prisma: any = {
      waybillInboxItem: inbox,
      waybill: waybills,
      withTenant: async (_c: string, fn: (tx: any) => any) => fn(prisma),
      $transaction: async (fn: any) => fn(prisma),
    };

    const mod = await Test.createTestingModule({
      providers: [
        WaybillsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: NotificationsService, useValue: { notifyWaybillStatus: jest.fn() } },
        { provide: EcommerceService, useValue: { pushStatusToShopify: jest.fn().mockResolvedValue(undefined) } },
        { provide: BillingService, useValue: { hasFeature: jest.fn().mockResolvedValue(true), consume: jest.fn().mockResolvedValue(undefined), assertCanCreate: jest.fn().mockResolvedValue(undefined) } },
        { provide: EventsGateway, useValue: { emitInboxItemStatus: jest.fn(), emitWaybillInboxChanged: jest.fn() } },
        { provide: DriverComplianceService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    svc = mod.get(WaybillsService);
  });

  const seedItem = (over: Row = {}) =>
    inbox.rows.push({
      id: 'inbox-1',
      companyId: TENANT,
      status: 'READY',
      extractedData: { consigneeName: 'Acme', waybillNumber: 'WB-1' },
      ...over,
    });

  it('creates one waybill and marks the item committed', async () => {
    seedItem();
    const out = await svc.commitInboxItem('inbox-1', TENANT);
    expect(out).toBeTruthy();
    expect(inbox.rows[0].status).toBe('COMMITTED');
    expect(inbox.rows[0].waybillId).toBeTruthy();
  });

  it('does not create a second waybill when someone else commits first', async () => {
    seedItem();

    // Another caller commits the item after we read it as READY.
    const original = inbox.updateMany.getMockImplementation();
    let flipped = false;
    inbox.updateMany.mockImplementation(async (args: any) => {
      if (!flipped) {
        flipped = true;
        inbox.rows[0].status = 'COMMITTED';
      }
      return original!(args);
    });

    await expect(svc.commitInboxItem('inbox-1', TENANT)).rejects.toThrow(ConflictException);
    // The whole point: the losing caller created nothing.
    expect(waybills.rows).toHaveLength(0);
  });

  it('refuses to commit an item that is not READY', async () => {
    seedItem({ status: 'COMMITTED' });
    await expect(svc.commitInboxItem('inbox-1', TENANT)).rejects.toThrow(BadRequestException);
  });

  it('returns the item to READY if creating the waybill fails, so the queue does not swallow it', async () => {
    seedItem();
    // Force the create to blow up after the claim has been taken.
    jest.spyOn(svc, 'create').mockRejectedValueOnce(new Error('validation failed'));

    await expect(svc.commitInboxItem('inbox-1', TENANT)).rejects.toThrow('validation failed');
    expect(inbox.rows[0].status).toBe('READY');
  });
});
