import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AddKeyResultDto,
  CreateObjectiveDto,
  UpdateKeyResultDto,
  UpdateObjectiveDto,
} from './okr.dto';

/**
 * OKR bodies.
 *
 * The service casts `status` with `as any` and assigns `unit` unconditionally,
 * so before this DTO an unrecognised value reached Prisma and came back as a
 * 500 (enum violation) instead of a 400. That is the behaviour these pin.
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

describe('objectives', () => {
  it('accepts a well-formed objective', async () => {
    const dto = await through(CreateObjectiveDto, {
      title: 'Cut empty running',
      quarter: '2026-Q4',
      owner: 'Kader',
      status: 'ON_TRACK',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a quarter that is not YYYY-Qn', async () => {
    // The quarter is indexed and queried as a string; free text would make it
    // unqueryable.
    const dto = await through(CreateObjectiveDto, { title: 'X', quarter: 'next quarter' });
    expect(await errorsFor(dto)).toContain('quarter');
  });

  it('rejects a quarter outside 1-4', async () => {
    const dto = await through(CreateObjectiveDto, { title: 'X', quarter: '2026-Q5' });
    expect(await errorsFor(dto)).toContain('quarter');
  });

  it('rejects an unknown status, which would otherwise be a Prisma 500', async () => {
    const dto = await through(CreateObjectiveDto, { title: 'X', quarter: '2026-Q4', status: 'VIBING' });
    expect(await errorsFor(dto)).toContain('status');
  });

  it('accepts every real status', async () => {
    for (const status of ['ON_TRACK', 'AT_RISK', 'BEHIND', 'ACHIEVED', 'CANCELLED']) {
      const dto = await through(CreateObjectiveDto, { title: 'X', quarter: '2026-Q4', status });
      expect(await errorsFor(dto)).toEqual([]);
    }
  });

  it('lets a partial update through without inventing fields', async () => {
    const dto = await strip(UpdateObjectiveDto, { title: 'Renamed' });
    expect(await errorsFor(dto)).toEqual([]);
    expect(dto.quarter).toBeUndefined();
  });
});

describe('key results', () => {
  it('accepts a key result with a target', async () => {
    const dto = await through(AddKeyResultDto, {
      title: 'Empty running under 12%',
      unit: 'PERCENT',
      startValue: 18,
      targetValue: 12,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a target value', async () => {
    const dto = await through(AddKeyResultDto, { title: 'Empty running' });
    expect(await errorsFor(dto)).toContain('targetValue');
  });

  it('rejects an unknown unit', async () => {
    const dto = await through(AddKeyResultDto, {
      title: 'X',
      targetValue: 1,
      unit: 'BUSHELS',
    });
    expect(await errorsFor(dto)).toContain('unit');
  });

  it('rejects a non-numeric target', async () => {
    const dto = await through(AddKeyResultDto, { title: 'X', targetValue: 'lots' });
    expect(await errorsFor(dto)).toContain('targetValue');
  });

  it('rejects an absurd sortOrder', async () => {
    const dto = await through(UpdateKeyResultDto, { sortOrder: 1e9 });
    expect(await errorsFor(dto)).toContain('sortOrder');
  });

  it('strips fields the service does not write', async () => {
    // updateKeyResult builds `data` from an explicit key list, so anything else
    // is dropped by the service anyway — this asserts the edge agrees.
    const dto = await strip(UpdateKeyResultDto, { title: 'X', objectiveId: 'someone-else' });
    expect(dto.objectiveId).toBeUndefined();
  });
});
