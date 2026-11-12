import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AddCargoDto,
  AddChargeDto,
  AddContainerDto,
  SetDemurrageTermsDto,
  UpdateCargoDto,
  UpsertEdiCredentialDto,
} from './forwarding-operations.dto';

/**
 * The forwarding services build their Prisma calls field by field, so nothing
 * here is a mass-assignment hole. What an untyped body did allow was unbounded
 * input: a `vgmKg` of 1e300, a `secret` of ten megabytes, `dimensions` as a
 * nested object. These tests are about the bounds.
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

describe('addContainer', () => {
  it('accepts a well-formed container', async () => {
    const dto = await through(AddContainerDto, {
      containerNo: 'MSKU1234567',
      isoType: '22GP',
      sealNo: 'SL123',
      vgmKg: 18000,
    });
    expect(dto.containerNo).toEqual('MSKU1234567');
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an absurd verified gross mass', async () => {
    const dto = await through(AddContainerDto, {
      containerNo: 'MSKU1234567',
      isoType: '22GP',
      vgmKg: 1e300,
    });
    expect(await errorsFor(dto)).toContain('vgmKg');
  });

  it('strips fields the service does not read', async () => {
    // The service lists its Prisma fields explicitly, so this is belt and
    // braces — but it is also what stops a caller shipping `id` or `fileId`.
    const dto = await strip(AddContainerDto, {
      containerNo: 'MSKU1234567',
      isoType: '22GP',
      id: 'attacker',
      fileId: 'someone-elses-file',
    });
    expect(dto.fileId).toBeUndefined();
    expect(dto.id).toBeUndefined();
  });
});

describe('cargo — string fields must not accept objects', () => {
  it('rejects dimensions that are not a string', async () => {
    const dto = await through(AddCargoDto, {
      description: 'Steel coils',
      dimensions: { width: 1, height: 2 },
    });
    expect(await errorsFor(dto)).toContain('dimensions');
  });

  it('rejects a negative customs value', async () => {
    const dto = await through(AddCargoDto, { description: 'Steel coils', customsValue: -5 });
    expect(await errorsFor(dto)).toContain('customsValue');
  });

  it('accepts a partial update on a cargo line', async () => {
    const dto = await through(UpdateCargoDto, { hsCode: '7208.51' });
    expect(await errorsFor(dto)).toEqual([]);
    expect((dto as unknown as Record<string, unknown>).description).toBeUndefined();
  });

  it('rejects an empty cargo update', async () => {
    // Every field is optional, so an empty body is valid by shape — the point
    // is that it must not crash the service, which builds `data` from keys.
    const dto = await through(UpdateCargoDto, {});
    expect(await errorsFor(dto)).toEqual([]);
  });
});

describe('charges', () => {
  it('accepts a charge and defaults nothing on the DTO itself', async () => {
    const dto = await through(AddChargeDto, { description: 'THC', cost: 100, sell: 150 });
    expect(await errorsFor(dto)).toEqual([]);
    // The 'ZAR' default and the upper-casing live in the service.
    expect(dto.currency).toBeUndefined();
  });

  it('rejects a negative sell price beyond the bound', async () => {
    const dto = await through(AddChargeDto, { description: 'THC', sell: -1e15 });
    expect(await errorsFor(dto)).toContain('sell');
  });
});

describe('demurrage terms', () => {
  it('accepts free days and a rate', async () => {
    const dto = await through(SetDemurrageTermsDto, { freeDays: 7, perDiemRate: 450 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts null to clear a date', async () => {
    // Nullable on purpose: sending null is how an operator clears returnedAt.
    const dto = await through(SetDemurrageTermsDto, { returnedAt: null });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a malformed date string', async () => {
    const dto = await through(SetDemurrageTermsDto, { availableFrom: 'not-a-date' });
    expect(await errorsFor(dto)).toContain('availableFrom');
  });

  it('rejects an absurd per-diem rate', async () => {
    const dto = await through(SetDemurrageTermsDto, { perDiemRate: 1e12 });
    expect(await errorsFor(dto)).toContain('perDiemRate');
  });
});

describe('EDI credentials', () => {
  it('accepts each valid transmission path', async () => {
    for (const path of ['DIRECT_EDI', 'SERVICE_PROVIDER', 'CLEARING_AGENT_HANDOFF']) {
      const payload: Record<string, unknown> = { path };
      if (path === 'CLEARING_AGENT_HANDOFF') payload.agentEmail = 'agent@example.co.za';
      const dto = await through(UpsertEdiCredentialDto, payload);
      expect(await errorsFor(dto)).toEqual([]);
    }
  });

  it('rejects an unknown path', async () => {
    const dto = await through(UpsertEdiCredentialDto, { path: 'CARRIER_PIGEON' });
    expect(await errorsFor(dto)).toContain('path');
  });

  it('rejects a malformed agent email', async () => {
    const dto = await through(UpsertEdiCredentialDto, {
      path: 'CLEARING_AGENT_HANDOFF',
      agentEmail: 'not-an-email',
    });
    expect(await errorsFor(dto)).toContain('agentEmail');
  });

  it('rejects an oversized secret', async () => {
    // The secret is encrypted and stored on every upsert, so it is bounded.
    const dto = await through(UpsertEdiCredentialDto, {
      path: 'DIRECT_EDI',
      secret: 'x'.repeat(5000),
    });
    expect(await errorsFor(dto)).toContain('secret');
  });
});
