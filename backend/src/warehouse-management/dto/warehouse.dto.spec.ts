import 'reflect-metadata'; // must precede class-transformer's decorators
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AdjustStockDto,
  BulkCreateBinsDto,
  CreateBinDto,
  CreateGoodsReceiptDto,
  CreatePickOrderDto,
  CreateWarehouseDto,
  CreateZoneDto,
  ReceiveGoodsDto,
  SubmitCycleCountDto,
  VerifyScanDto,
} from './warehouse.dto';

/**
 * The edge of the WMS module.
 *
 * Three service methods write the body straight into Prisma:
 *
 *     createZone:         data: { warehouseId: wh.id, ...dto }
 *     createBin:          data: { zoneId, ...dto }
 *     createGoodsReceipt: lines: { create: dto.lines }
 *
 * so this is where `id` and `companyId` stop being caller-controlled. The
 * nested `lines` arrays matter as much as the top level — a nested create from
 * raw JSON carries the same exposure one level down.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (cls: new () => object, payload: Record<string, unknown>) =>
  (await through(cls, payload)) as unknown as Record<string, unknown>;

describe('createZone / createBin — the spread that lets a caller set identity', () => {
  it('accepts a well-formed zone', async () => {
    const dto = await through(CreateZoneDto, { name: 'Zone A', code: 'A', type: 'BULK' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('does not let a caller set warehouseId, id or companyId on a zone', async () => {
    // The service does `data: { warehouseId: wh.id, ...dto }`. Anything that
    // survives here lands in that spread.
    const dto = await strip(CreateZoneDto, {
      name: 'Zone A',
      code: 'A',
      warehouseId: 'someone-elses-warehouse',
      id: 'attacker-id',
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.name).toEqual('Zone A');
    for (const k of ['warehouseId', 'id', 'companyId', 'createdAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('does not let a caller set zoneId, id or companyId on a bin', async () => {
    const dto = await strip(CreateBinDto, {
      code: 'A-01-03-002-001',
      zoneId: 'someone-elses-zone',
      id: 'attacker-id',
      companyId: 'other-tenant',
    });
    expect(dto.code).toEqual('A-01-03-002-001');
    for (const k of ['zoneId', 'id', 'companyId']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});

describe('bulkCreateBins — the unbounded loop', () => {
  it('accepts a realistic rack', async () => {
    const dto = await through(BulkCreateBinsDto, {
      aisle: '01',
      rack: '03',
      levels: 5,
      positions: 20,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses a request that would ask for an absurd number of bins', async () => {
    // The service runs levels x positions inserts with no cap of its own.
    const dto = await through(BulkCreateBinsDto, {
      aisle: '01',
      rack: '03',
      levels: 100000,
      positions: 100000,
    });
    expect(await errorsFor(dto).then((e) => e.sort())).toEqual(['levels', 'positions']);
  });
});

describe('adjustStock — quantity is a delta, not an absolute', () => {
  it('accepts a negative adjustment, because that is how stock is reduced', () => {
    // The service computes quantityOnHand + quantity and refuses a negative
    // RESULT. A @Min(0) at the edge would break every stock reduction in the
    // module, so the sign is allowed through and the service owns the rule.
    return through(AdjustStockDto, {
      binId: 'bin-1',
      sku: 'SKU-1',
      quantity: -5,
      reason: 'damaged',
    }).then((dto) => expect(errorsFor(dto)).resolves.toEqual([]));
  });

  it('still rejects a non-numeric quantity', async () => {
    const dto = await through(AdjustStockDto, {
      binId: 'bin-1',
      sku: 'SKU-1',
      quantity: 'lots',
      reason: 'damaged',
    });
    expect(await errorsFor(dto)).toContain('quantity');
  });
});

describe('nested lines are validated, not just the envelope', () => {
  it('strips identity fields from goods-receipt lines', async () => {
    // `lines: { create: dto.lines }` — a nested create from raw JSON.
    const dto = (await through(CreateGoodsReceiptDto, {
      warehouseId: 'wh-1',
      lines: [
        { sku: 'SKU-1', expectedQty: 5, id: 'attacker', companyId: 'other', goodsReceiptId: 'x' },
      ],
    })) as unknown as { lines: Array<Record<string, unknown>> };

    expect(dto.lines).toHaveLength(1);
    expect(dto.lines[0].sku).toEqual('SKU-1');
    expect(dto.lines[0].expectedQty).toEqual(5);
    for (const k of ['id', 'companyId', 'goodsReceiptId']) {
      expect(dto.lines[0][k]).toBeUndefined();
    }
  });

  it('rejects a line with a negative quantity', async () => {
    const dto = await through(CreateGoodsReceiptDto, {
      warehouseId: 'wh-1',
      lines: [{ sku: 'SKU-1', expectedQty: -5 }],
    });
    const errors = await validate(dto as object);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a receipt with no warehouse', async () => {
    const dto = await through(CreateGoodsReceiptDto, { poNumber: 'PO-1' });
    expect(await errorsFor(dto)).toContain('warehouseId');
  });

  it('requires at least one line on a pick order', async () => {
    const dto = await through(CreatePickOrderDto, { warehouseId: 'wh-1', lines: [] });
    expect(await errorsFor(dto)).toContain('lines');
  });

  it('validates cycle-count lines', async () => {
    const dto = await through(SubmitCycleCountDto, {
      lines: [{ binCode: 'A-01', sku: 'SKU-1', countedQty: 'many' }],
    });
    const errors = await validate(dto as object);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires at least one line when receiving goods', async () => {
    const dto = await through(ReceiveGoodsDto, { lines: [] });
    expect(await errorsFor(dto)).toContain('lines');
  });
});

describe('the remaining envelopes', () => {
  it('requires a warehouse name', async () => {
    const dto = await through(CreateWarehouseDto, { code: 'JHB-01' });
    expect(await errorsFor(dto)).toContain('name');
  });

  it('accepts a warehouse', async () => {
    const dto = await through(CreateWarehouseDto, { name: 'JHB Main', code: 'JHB-01', lat: -26.2 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an unknown scan context', async () => {
    const dto = await through(VerifyScanDto, { barcode: 'SKU-1', context: 'SOMETHING_ELSE' });
    expect(await errorsFor(dto)).toContain('context');
  });

  it('accepts each known scan context', async () => {
    for (const context of ['RECEIVE', 'PICK', 'PUT_AWAY', 'TRANSFER', 'CYCLE_COUNT']) {
      const dto = await through(VerifyScanDto, { barcode: 'SKU-1', context });
      expect(await errorsFor(dto)).toEqual([]);
    }
  });
});
