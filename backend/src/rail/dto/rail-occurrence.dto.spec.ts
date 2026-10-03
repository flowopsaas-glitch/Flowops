import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOccurrenceDto, NotifyOccurrenceDto, OccurrenceNoteDto } from './rail-occurrence.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const base = { type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', occurredAt: '2026-10-02T08:30:00Z', description: 'Three wagons derailed at km 120' };

describe('CreateOccurrenceDto', () => {
  it('accepts a minimal and a full occurrence report', async () => {
    await expect(run(CreateOccurrenceDto, base)).resolves.toMatchObject({ type: 'DERAILMENT' });
    await expect(run(CreateOccurrenceDto, {
      ...base, corridorCode: 'COR-ORE', location: 'Km 120', trainSlotRef: 'T-100', consignmentId: 'ckabc', handshakeReportId: 'ckdef',
      responsibleParty: 'UNDETERMINED', fatalities: false, hazmatInvolved: true,
    })).resolves.toBeDefined();
  });

  it.each(['DERAILMENT', 'COLLISION', 'OHTE_CABLE_THEFT', 'SPAD', 'HAZMAT_SPILL', 'OTHER'])('accepts type %s', async (type) => {
    await expect(run(CreateOccurrenceDto, { ...base, type })).resolves.toBeDefined();
  });

  it.each(['LEVEL_1_CODE_GREEN', 'LEVEL_2_CODE_ORANGE', 'LEVEL_3_CODE_RED'])('accepts level %s', async (level) => {
    await expect(run(CreateOccurrenceDto, { ...base, level })).resolves.toBeDefined();
  });

  it.each(['TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED'])('accepts responsible party %s', async (responsibleParty) => {
    await expect(run(CreateOccurrenceDto, { ...base, responsibleParty })).resolves.toBeDefined();
  });

  it('strips what it does not declare — status, deadlines, links, tenant are all server-owned', async () => {
    const out: any = await run(CreateOccurrenceDto, {
      ...base, status: 'CLOSED', companyId: 'EVIL', occurrenceNumber: 'OR-1', preliminaryReportDueAt: '2099-01-01', preliminaryReportFiledAt: '2026-01-01',
      deviationId: 'forced', auditLogId: 'forged', reportedToTcoAt: '2026-01-01', closedAt: '2026-01-01', createdById: 'x',
    });
    expect(Object.keys(out).sort()).toEqual(['description', 'level', 'occurredAt', 'type']);
  });

  it.each([
    ['an unknown type', { type: 'FIRE' }],
    ['a lower-case type', { type: 'derailment' }],
    ['an unknown level', { level: 'LEVEL_4' }],
    ['an unparseable time', { occurredAt: 'around lunch' }],
    ['a description shorter than 5 characters', { description: 'oops' }],
    ['an over-long description', { description: 'x'.repeat(4001) }],
    ['an object as the description', { description: { a: 1 } }],
    ['a lower-case corridor code', { corridorCode: 'cor-ore' }],
    ['an object as the corridor code', { corridorCode: { $ne: 1 } }],
    ['an over-long location', { location: 'x'.repeat(201) }],
    ['an over-long slot reference', { trainSlotRef: 'x'.repeat(121) }],
    ['an unknown responsible party', { responsibleParty: 'IM' }],
    ['the STRING "false" for fatalities (it would be coerced to true)', { fatalities: 'false' }],
    ['the string "false" for hazmatInvolved', { hazmatInvolved: 'false' }],
    ['a number for fatalities', { fatalities: 1 }],
  ])('rejects %s', async (_l, extra) => bad(CreateOccurrenceDto, { ...base, ...extra }));

  it('requires type, level, time and description', async () => {
    for (const k of Object.keys(base)) {
      const { [k]: _omit, ...rest } = base as Record<string, string>;
      await bad(CreateOccurrenceDto, rest);
    }
  });
});

describe('NotifyOccurrenceDto', () => {
  it('accepts the TCO or the Regulator, with an optional time', async () => {
    await expect(run(NotifyOccurrenceDto, { to: 'TCO' })).resolves.toBeDefined();
    await expect(run(NotifyOccurrenceDto, { to: 'RSR', at: '2026-10-02T09:00:00Z' })).resolves.toBeDefined();
  });
  it.each([
    ['an unknown recipient', { to: 'MEDIA' }], ['a lower-case recipient', { to: 'tco' }], ['no recipient', {}], ['an unparseable time', { to: 'TCO', at: 'now-ish' }],
  ])('rejects %s', async (_l, body) => bad(NotifyOccurrenceDto, body));
});

describe('OccurrenceNoteDto', () => {
  it('needs a note of 3–4000 characters', async () => {
    await expect(run(OccurrenceNoteDto, { note: 'RSR inspector on site' })).resolves.toBeDefined();
    await bad(OccurrenceNoteDto, {});
    await bad(OccurrenceNoteDto, { note: 'ab' });
    await bad(OccurrenceNoteDto, { note: 'x'.repeat(4001) });
    await bad(OccurrenceNoteDto, { note: { x: 1 } });
  });
});
