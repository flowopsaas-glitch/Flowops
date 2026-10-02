/**
 * The dangerous-goods fields on the consignment and wagon DTOs (RAIL-011), and the strict boolean handling that
 * protects them. The deeper "is it complete enough to dispatch" rules live in rail-dangerous-goods.spec.ts.
 */
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateRailConsignmentDto } from './create-rail-consignment.dto';
import { UpdateRailConsignmentDto } from './update-rail-consignment.dto';
import { CreateWagonDto } from './wagon.dto';
import { CreateSlotApplicationDto } from './rail-slot.dto';
import { ReviewDeviationDto, ResolveDeviationDto, UpdateDeviationDto } from './handshake.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const DG = {
  isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3', placardRef: 'Placard 3 — flammable liquid', emergencyContact24h: '+27 11 555 0100',
  msdsDocumentUrl: 'https://example.org/msds/petrol.pdf',
};

describe.each([
  ['CreateRailConsignmentDto', CreateRailConsignmentDto, { commodity: 'Petrol' }],
  ['UpdateRailConsignmentDto', UpdateRailConsignmentDto, {}],
  ['CreateWagonDto', CreateWagonDto, { wagonNumber: 'TANK-1' }],
])('%s — dangerous-goods fields', (_name, dto, base) => {
  it('accepts a complete declaration', async () => {
    await expect(run(dto, { ...base, ...DG })).resolves.toMatchObject(DG);
  });

  it('accepts no DG fields at all (the gate, not the DTO, decides whether that is enough)', async () => {
    await expect(run(dto, base)).resolves.toBeDefined();
  });

  it.each([
    ['UN1203'], ['un1203'], ['UN 1203'], ['1203'], ['  1203  '.trim()],
  ])('accepts the UN number written as "%s" (the service normalises it)', async (unNumber) => {
    await expect(run(dto, { ...base, unNumber })).resolves.toBeDefined();
  });

  it.each([['1'], ['2.1'], ['6.1'], ['1.4S'], ['1.4s'], ['9'], ['5.2']])('accepts IMDG class %s', async (imdgClass) => {
    await expect(run(dto, { ...base, imdgClass })).resolves.toBeDefined();
  });

  it.each([
    ['a UN number with three digits', { unNumber: 'UN123' }],
    ['a UN number with five digits', { unNumber: 'UN12345' }],
    ['a UN number with letters', { unNumber: 'UNABCD' }],
    ['SQL in the UN number', { unNumber: "UN1203'; --" }],
    ['an object as the UN number', { unNumber: { $ne: 1 } }],
    ['IMDG class 0', { imdgClass: '0' }],
    ['IMDG class 10', { imdgClass: '10' }],
    ['IMDG division 2.7', { imdgClass: '2.7' }],
    ['an IMDG class in words', { imdgClass: 'flammable' }],
    ['an object as the IMDG class', { imdgClass: { a: 1 } }],
    ['an over-long placard reference', { placardRef: 'x'.repeat(61) }],
    ['an object as the placard reference', { placardRef: { a: 1 } }],
    ['an emergency contact that is not a phone number', { emergencyContact24h: 'call Dave' }],
    ['an emergency contact that is too short', { emergencyContact24h: '12345' }],
    ['an emergency contact with a script', { emergencyContact24h: '+27 <script>' }],
    ['an http (not https) safety-data-sheet link', { msdsDocumentUrl: 'http://example.org/msds.pdf' }],
    ['a javascript: safety-data-sheet link', { msdsDocumentUrl: 'javascript:alert(1)' }],
    ['a safety-data-sheet link containing a space', { msdsDocumentUrl: 'https://example.org/my msds.pdf' }],
    ['an over-long safety-data-sheet link', { msdsDocumentUrl: `https://example.org/${'x'.repeat(500)}` }],
    ['an object as the safety-data-sheet link', { msdsDocumentUrl: { a: 1 } }],
  ])('rejects %s', async (_l, extra) => bad(dto, { ...base, ...extra }));

  it('accepts null to clear a field (the edit form sends null, not an empty string)', async () => {
    await expect(run(dto, { ...base, unNumber: null, imdgClass: null, placardRef: null, emergencyContact24h: null, msdsDocumentUrl: null })).resolves.toBeDefined();
  });

  it('REJECTS an empty string for a pattern-checked field — "clear" must be null, never "" (so a blank form cannot pass as a value)', async () => {
    await bad(dto, { ...base, unNumber: '' });
    await bad(dto, { ...base, msdsDocumentUrl: '' });
  });
});

describe('strict booleans — the string "false" must NEVER switch a flag on', () => {
  // The global pipe uses enableImplicitConversion; without RawBoolean, Boolean("false") === true.
  const cases: Array<[string, any, Record<string, unknown>, string]> = [
    ['CreateRailConsignmentDto.isDangerousGoods', CreateRailConsignmentDto, { commodity: 'x' }, 'isDangerousGoods'],
    ['CreateWagonDto.isDangerousGoods', CreateWagonDto, { wagonNumber: 'W1' }, 'isDangerousGoods'],
    ['CreateSlotApplicationDto.isDangerousGoods', CreateSlotApplicationDto, { corridorCode: 'COR-ORE', requestedFrom: '2026-11-01T00:00:00Z', requestedUntil: '2027-11-01T00:00:00Z' }, 'isDangerousGoods'],
    ['ReviewDeviationDto.agree (a formal agree / dispute decision)', ReviewDeviationDto, {}, 'agree'],
    ['ResolveDeviationDto.costRecovered', ResolveDeviationDto, {}, 'costRecovered'],
    ['UpdateDeviationDto.costRecovered', UpdateDeviationDto, {}, 'costRecovered'],
  ];

  it.each(cases)('%s accepts real booleans only', async (_n, dto, base, field) => {
    await expect(run(dto, { ...base, [field]: true })).resolves.toMatchObject({ [field]: true });
    await expect(run(dto, { ...base, [field]: false })).resolves.toMatchObject({ [field]: false });
    for (const wrong of ['false', 'true', 'no', 'yes', 0, 1, '', {}, []]) {
      await bad(dto, { ...base, [field]: wrong });
    }
  });
});
