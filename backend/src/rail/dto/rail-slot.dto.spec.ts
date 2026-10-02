import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AllocateApplicationDto, ConflictDto, CreateComplianceDocDto, CreateSlotApplicationDto, EnvelopeCheckDto, SelfScreeningDto,
  UpdateSlotApplicationDto,
} from './rail-slot.dto';
import { CreateWagonDto } from './wagon.dto';

// the production pipe settings (backend/src/main.ts)
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const base = { corridorCode: 'COR-ORE', requestedFrom: '2026-11-01T00:00:00Z', requestedUntil: '2027-11-01T00:00:00Z' };

describe('CreateSlotApplicationDto', () => {
  it('accepts a minimal and a full application', async () => {
    await expect(run(CreateSlotApplicationDto, base)).resolves.toMatchObject({ corridorCode: 'COR-ORE' });
    await expect(run(CreateSlotApplicationDto, {
      ...base, originName: 'Hotazel', destinationName: 'Coega', tractionType: 'DIESEL', commodity: 'Manganese', isDangerousGoods: false,
      trainsPerWeek: 7, wagonsPerTrain: 84, annualTonnes: 3_000_000, gauge: 'CAPE_1067MM', axleLoadTonnes: 26, vehicleProfile: 'B_PLUS_1', trainLengthM: 1400,
    })).resolves.toBeDefined();
  });
  it('strips fields it does not declare (companyId, status, mobilizeBy, …) — nothing can be mass-assigned', async () => {
    const out: any = await run(CreateSlotApplicationDto, { ...base, companyId: 'EVIL', status: 'ALLOCATED', mobilizeBy: '2099-01-01', forfeitureFlaggedAt: null });
    expect(out).not.toHaveProperty('companyId');
    expect(out).not.toHaveProperty('status');
    expect(out).not.toHaveProperty('mobilizeBy');
  });
  it.each([
    ['lower-case corridor code', { corridorCode: 'cor-ore' }],
    ['corridor code with spaces', { corridorCode: 'COR ORE' }],
    ['an object as the corridor', { corridorCode: { $ne: 1 } }],
    ['unknown traction', { tractionType: 'STEAM' }],
    ['unknown gauge', { gauge: 'G1067' }],
    ['unknown profile', { vehicleProfile: 'C' }],
    ['axle load above 40 t', { axleLoadTonnes: 41 }],
    ['axle load of zero', { axleLoadTonnes: 0 }],
    ['negative tonnes', { annualTonnes: -1 }],
    ['fractional trains per week', { trainsPerWeek: 2.5 }],
    ['an unparseable date', { requestedFrom: 'next tuesday' }],
    ['an object as a name', { originName: { evil: true } }],
    ['an over-long commodity', { commodity: 'x'.repeat(121) }],
  ])('rejects %s', async (_l, extra) => bad(CreateSlotApplicationDto, { ...base, ...extra }));
  it('requires the corridor and the window', async () => {
    await bad(CreateSlotApplicationDto, { requestedFrom: base.requestedFrom, requestedUntil: base.requestedUntil });
    await bad(CreateSlotApplicationDto, { corridorCode: 'COR-ORE', requestedFrom: base.requestedFrom });
  });
  it('the update DTO makes everything optional', async () => {
    await expect(run(UpdateSlotApplicationDto, {})).resolves.toBeDefined();
    await bad(UpdateSlotApplicationDto, { corridorCode: 'nope' });
  });
});

describe('SelfScreeningDto (Annexure 25)', () => {
  const ans = (no: string, answer = 'YES') => ({ no, answer });
  it('accepts up to seven answers and an access type', async () => {
    await expect(run(SelfScreeningDto, { accessType: 'Network B', answers: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'].map((n) => ans(n)) })).resolves.toBeDefined();
  });
  it.each([
    ['a question the form does not have', { answers: [ans('viii')] }],
    ['an answer other than YES / NO', { answers: [ans('i', 'MAYBE')] }],
    ['more than seven answers', { answers: Array.from({ length: 8 }, () => ans('i')) }],
    ['answers that are not an array', { answers: 'yes' }],
    ['an unknown access type', { accessType: 'Network C', answers: [] }],
    ['over-long remarks', { answers: [{ no: 'i', answer: 'NO', remarks: 'x'.repeat(1001) }] }],
  ])('rejects %s', async (_l, body) => bad(SelfScreeningDto, body));
});

describe('CreateComplianceDocDto', () => {
  const doc = { docType: 'RSR_PERMIT', validFrom: '2026-01-01', validUntil: '2027-01-01' };
  it('accepts a document with an https pointer', async () => {
    await expect(run(CreateComplianceDocDto, { ...doc, documentUrl: 'https://files.example.org/rsr.pdf', referenceNumber: 'RSR-1' })).resolves.toBeDefined();
  });
  it.each([
    ['an unknown document type', { docType: 'DRIVING_LICENCE' }],
    ['a non-https document link', { documentUrl: 'http://files.example.org/x' }],
    ['a javascript: link', { documentUrl: 'javascript:alert(1)' }],
    ['an unparseable date', { validUntil: 'soon' }],
    ['over-long notes', { notes: 'x'.repeat(2001) }],
  ])('rejects %s', async (_l, extra) => bad(CreateComplianceDocDto, { ...doc, ...extra }));
});

describe('EnvelopeCheckDto', () => {
  it('accepts manual subjects, or a consignment id', async () => {
    await expect(run(EnvelopeCheckDto, { corridorCode: 'COR-ORE', subjects: [{ label: 'W1', gauge: 'CAPE_1067MM', tareTonnes: 24, loadedTonnes: 80, axles: 4 }] })).resolves.toBeDefined();
    await expect(run(EnvelopeCheckDto, { consignmentId: 'abc123' })).resolves.toBeDefined();
  });
  it.each([
    ['more than 500 subjects', { subjects: Array.from({ length: 501 }, () => ({})) }],
    ['a bad gauge in a subject', { subjects: [{ gauge: 'WIDE' }] }],
    ['13 axles', { subjects: [{ axles: 13 }] }],
    ['an axle load above 40 t', { subjects: [{ axleLoadTonnes: 55 }] }],
  ])('rejects %s', async (_l, body) => bad(EnvelopeCheckDto, body));
});

describe('workflow DTOs', () => {
  it('ConflictDto needs a real note', async () => {
    await expect(run(ConflictDto, { note: 'Clash with TOC-7' })).resolves.toBeDefined();
    await bad(ConflictDto, { note: 'x' });
    await bad(ConflictDto, {});
  });
  it('AllocateApplicationDto dates are optional but must parse', async () => {
    await expect(run(AllocateApplicationDto, {})).resolves.toBeDefined();
    await bad(AllocateApplicationDto, { allocatedAt: 'yesterday' });
  });
});

describe('CreateWagonDto — envelope particulars (new in Wave 2)', () => {
  const wagon = { wagonNumber: 'SAR-064213' };
  it('accepts axles, gauge and profile', async () => {
    await expect(run(CreateWagonDto, { ...wagon, axles: 4, gauge: 'CAPE_1067MM', vehicleProfile: 'B' })).resolves.toMatchObject({ axles: 4, gauge: 'CAPE_1067MM' });
  });
  it('still accepts the old shape (no new fields)', async () => {
    await expect(run(CreateWagonDto, { ...wagon, tareTonnes: 24, loadedTonnes: 70, type: 'GONDOLA' })).resolves.toBeDefined();
  });
  it.each([[{ axles: 0 }], [{ axles: 13 }], [{ axles: 2.5 }], [{ gauge: 'X' }], [{ vehicleProfile: 'Z' }]])('rejects %j', async (extra) => bad(CreateWagonDto, { ...wagon, ...extra }));
});
