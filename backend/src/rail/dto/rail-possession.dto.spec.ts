import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePossessionDto } from './rail-possession.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const base = { corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', title: 'Ore line maintenance', startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-03T00:00:00Z' };

describe('CreatePossessionDto', () => {
  it('accepts a minimal and a full possession window', async () => {
    await expect(run(CreatePossessionDto, base)).resolves.toMatchObject({ corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN' });
    await expect(run(CreatePossessionDto, {
      ...base, location: 'Km 120 — Km 140', description: 'Re-sleepering', imReference: 'IM-2026-77', noticeGivenAt: '2026-10-01T08:00:00Z',
    })).resolves.toBeDefined();
  });

  it.each(['ANNUAL_PLAN', 'LOCKED_60_DAY', 'AD_HOC_EMERGENCY'])('accepts kind %s (the three kinds in the brief)', async (kind) => {
    await expect(run(CreatePossessionDto, { ...base, kind })).resolves.toBeDefined();
  });

  it('strips everything it does not declare — status, tenant, creator can never be mass-assigned', async () => {
    const out: any = await run(CreatePossessionDto, { ...base, status: 'COMPLETED', companyId: 'EVIL', createdById: 'x', id: 'forced', locked: true });
    expect(Object.keys(out).sort()).toEqual(['corridorCode', 'endsAt', 'kind', 'startsAt', 'title']);
  });

  it.each([
    ['a lower-case corridor code', { corridorCode: 'cor-ore' }],
    ['a corridor code with spaces', { corridorCode: 'COR ORE' }],
    ['an object as the corridor code', { corridorCode: { $ne: 1 } }],
    ['an over-long corridor code', { corridorCode: `COR-${'A'.repeat(40)}` }],
    ['an unknown kind', { kind: 'WEEKEND' }],
    ['a title shorter than 3 characters', { title: 'ab' }],
    ['an over-long title', { title: 'x'.repeat(161) }],
    ['an object as the title', { title: { a: 1 } }],
    ['an unparseable start', { startsAt: 'soon' }],
    ['an unparseable end', { endsAt: '2026-13-45' }],
    ['an unparseable notice time', { noticeGivenAt: 'yesterday' }],
    ['an over-long location', { location: 'x'.repeat(201) }],
    ['an over-long description', { description: 'x'.repeat(2001) }],
    ['an over-long IM reference', { imReference: 'x'.repeat(121) }],
  ])('rejects %s', async (_l, extra) => bad(CreatePossessionDto, { ...base, ...extra }));

  it('requires the corridor, kind, title and both times', async () => {
    for (const k of Object.keys(base)) {
      const { [k]: _omit, ...rest } = base as Record<string, string>;
      await bad(CreatePossessionDto, rest);
    }
  });
});
