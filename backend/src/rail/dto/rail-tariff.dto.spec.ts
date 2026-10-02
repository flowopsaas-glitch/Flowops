import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { InvoiceDraftDto, TariffRequestDto } from './rail-tariff.dto';
import { RecordWeighbridgeReadingDto } from './rail-weighbridge.dto';

// the production pipe settings (backend/src/main.ts)
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const base = { consignmentId: 'ckabc123', distanceKm: 850 };

describe('TariffRequestDto', () => {
  it('accepts a minimal and a full request', async () => {
    await expect(run(TariffRequestDto, base)).resolves.toMatchObject({ distanceKm: 850 });
    await expect(run(TariffRequestDto, {
      ...base, financialYear: '2026/27', includeEmptyReturn: true, allowEscalation: false,
      traction: { type: 'DIESEL', litres: 12_000, pricePerUnitZar: 24.9 },
      ancillary: [{ code: 'ANX40-01', quantity: 3 }, { code: 'ANX40-04-02', quantity: 1.5 }],
    })).resolves.toBeDefined();
    await expect(run(TariffRequestDto, { ...base, traction: { type: 'ELECTRIC', kWh: 5000 } })).resolves.toBeDefined();
  });

  it('A CLIENT CANNOT SUPPLY A RATE OR A TOTAL: every pricing field is stripped, including inside nested objects', async () => {
    const out: any = await run(TariffRequestDto, {
      ...base, companyId: 'EVIL', loadedCentsPerGtk: 0.01, emptyCentsPerGtk: 0.01, centsPerGtk: 0.01, rate: 0.01, subtotalZar: 1, totalZar: 1, amountZar: 1, status: 'PRICED',
      dieselPricePerLitreZar: 1, electricityPricePerKwhZar: 1, overloadPenaltyPerTonneZar: 0, escalationPct: 0, hold: false,
      traction: { type: 'DIESEL', litres: 100, amountZar: 1, rate: 0.01, rateUnit: 'ZAR/L' },
      ancillary: [{ code: 'ANX40-01', quantity: 1, unitRateZar: 0, priceStatus: 'PUBLISHED', amountZar: 0, rate: 0 }],
    });
    expect(Object.keys(out).sort()).toEqual(['ancillary', 'consignmentId', 'distanceKm', 'traction']);
    expect(Object.keys(out.traction).sort()).toEqual(['litres', 'type']);
    expect(Object.keys(out.ancillary[0]).sort()).toEqual(['code', 'quantity']);
  });

  it.each([
    ['a zero distance', { distanceKm: 0 }],
    ['a negative distance', { distanceKm: -5 }],
    ['a distance below 0.1 km', { distanceKm: 0.05 }],
    ['a distance above 10 000 km', { distanceKm: 10_001 }],
    ['the string "850" as a distance (a number must be a number)', { distanceKm: '850' }],
    ['TRUE as a distance (it would be coerced to 1 km)', { distanceKm: true }],
    ['an object as the distance', { distanceKm: { km: 850 } }],
    ['an array as the distance', { distanceKm: [850] }],
    ['a null distance', { distanceKm: null }],
    ['an object as the consignment id', { consignmentId: { $ne: 1 } }],
    ['an empty consignment id', { consignmentId: '' }],
    ['an over-long consignment id', { consignmentId: 'x'.repeat(61) }],
    ['a financial year written 2026-27', { financialYear: '2026-27' }],
    ['a financial year written 2026/2027', { financialYear: '2026/2027' }],
    ['a number as the financial year', { financialYear: 2026 }],
    ['the string "false" for includeEmptyReturn (it would be coerced to true)', { includeEmptyReturn: 'false' }],
    ['the string "false" for allowEscalation (it would switch escalation ON)', { allowEscalation: 'false' }],
    ['a number for allowEscalation', { allowEscalation: 1 }],
    ['an unknown traction type', { traction: { type: 'STEAM' } }],
    ['a lower-case traction type', { traction: { type: 'diesel' } }],
    ['negative litres', { traction: { type: 'DIESEL', litres: -1 } }],
    ['zero litres', { traction: { type: 'DIESEL', litres: 0 } }],
    ['TRUE as litres', { traction: { type: 'DIESEL', litres: true } }],
    ['a string for kWh', { traction: { type: 'ELECTRIC', kWh: '5000' } }],
    ['a zero price per unit', { traction: { type: 'DIESEL', litres: 5, pricePerUnitZar: 0 } }],
    ['a traction that is not an object', { traction: 'DIESEL' }],
    ['an ancillary list that is not an array', { ancillary: 'ANX40-01' }],
    ['an ancillary code in lower case', { ancillary: [{ code: 'anx40-01', quantity: 1 }] }],
    ['an ancillary code with a missing number', { ancillary: [{ code: 'ANX40-1', quantity: 1 }] }],
    ['an ancillary code with trailing text', { ancillary: [{ code: 'ANX40-01; DROP', quantity: 1 }] }],
    ['an object as an ancillary code', { ancillary: [{ code: { a: 1 }, quantity: 1 }] }],
    ['a zero ancillary quantity', { ancillary: [{ code: 'ANX40-01', quantity: 0 }] }],
    ['a negative ancillary quantity', { ancillary: [{ code: 'ANX40-01', quantity: -2 }] }],
    ['a string ancillary quantity', { ancillary: [{ code: 'ANX40-01', quantity: '3' }] }],
    ['more than 50 ancillary lines', { ancillary: Array.from({ length: 51 }, () => ({ code: 'ANX40-01', quantity: 1 })) }],
    ['a non-object inside the ancillary list', { ancillary: ['ANX40-01'] }],
  ])('rejects %s', async (_l, extra) => bad(TariffRequestDto, { ...base, ...extra }));

  it('requires the consignment and the distance (there is no default distance)', async () => {
    await bad(TariffRequestDto, { distanceKm: 100 });
    await bad(TariffRequestDto, { consignmentId: 'ckabc123' });
  });

  it('keeps real booleans as booleans', async () => {
    const out: any = await run(TariffRequestDto, { ...base, includeEmptyReturn: false, allowEscalation: true });
    expect(out).toMatchObject({ includeEmptyReturn: false, allowEscalation: true });
  });
});

describe('InvoiceDraftDto', () => {
  it('accepts no body, or a client name', async () => {
    await expect(run(InvoiceDraftDto, {})).resolves.toBeDefined();
    await expect(run(InvoiceDraftDto, { clientName: 'Seriti Resources' })).resolves.toMatchObject({ clientName: 'Seriti Resources' });
  });
  it('strips anything else (amounts, status …) and rejects a blank or non-string name', async () => {
    const out: any = await run(InvoiceDraftDto, { clientName: 'X', total: 1, items: [], finalized: true, companyId: 'EVIL' });
    expect(Object.keys(out)).toEqual(['clientName']);
    await bad(InvoiceDraftDto, { clientName: '' });
    await bad(InvoiceDraftDto, { clientName: { a: 1 } });
    await bad(InvoiceDraftDto, { clientName: 'x'.repeat(201) });
  });
});

describe('RecordWeighbridgeReadingDto', () => {
  const reading = { consignmentId: 'ckabc123', wagonNumber: 'SAR-064213', actualTonnes: 82.4 };

  it('accepts a minimal and a full reading', async () => {
    await expect(run(RecordWeighbridgeReadingDto, reading)).resolves.toMatchObject({ actualTonnes: 82.4 });
    await expect(run(RecordWeighbridgeReadingDto, { ...reading, axles: 4, maxAxleLoadTonnes: 20, weighbridge: 'Hotazel WB-2', weighedAt: '2026-10-02T08:00:00Z', note: 'second pass' })).resolves.toBeDefined();
  });

  it('the CLIENT CANNOT DECIDE THE OUTCOME: status, limit source, allowed / excess tonnes, tenant and author are stripped', async () => {
    const out: any = await run(RecordWeighbridgeReadingDto, {
      ...reading, status: 'WITHIN_LIMIT', limitSource: 'CORRIDOR', allowedTonnes: 9999, excessTonnes: 0, holdStatus: 'NONE', companyId: 'EVIL', createdById: 'x', corridorCode: 'COR-ORE', id: 'forced',
    });
    expect(Object.keys(out).sort()).toEqual(['actualTonnes', 'consignmentId', 'wagonNumber']);
  });

  it.each([
    ['zero mass', { actualTonnes: 0 }],
    ['negative mass', { actualTonnes: -1 }],
    ['a mass above 1000 t', { actualTonnes: 1001 }],
    ['the string "82" as the mass', { actualTonnes: '82' }],
    ['TRUE as the mass (it would be coerced to 1 t)', { actualTonnes: true }],
    ['an object as the mass', { actualTonnes: {} }],
    ['zero axles', { axles: 0 }],
    ['13 axles', { axles: 13 }],
    ['2.5 axles', { axles: 2.5 }],
    ['the string "4" as the axle count', { axles: '4' }],
    ['a zero limit', { maxAxleLoadTonnes: 0 }],
    ['a limit above 60 t', { maxAxleLoadTonnes: 61 }],
    ['a string limit', { maxAxleLoadTonnes: '20' }],
    ['an empty wagon number', { wagonNumber: '' }],
    ['an object as the wagon number', { wagonNumber: { $ne: 'x' } }],
    ['an over-long wagon number', { wagonNumber: 'x'.repeat(61) }],
    ['an unparseable weighing time', { weighedAt: 'noonish' }],
    ['an over-long weighbridge name', { weighbridge: 'x'.repeat(121) }],
    ['an over-long note', { note: 'x'.repeat(1001) }],
    ['an object as the note', { note: { a: 1 } }],
  ])('rejects %s', async (_l, extra) => bad(RecordWeighbridgeReadingDto, { ...reading, ...extra }));

  it('requires the consignment, the wagon and the mass', async () => {
    for (const k of Object.keys(reading)) {
      const { [k]: _omit, ...rest } = reading as Record<string, unknown>;
      await bad(RecordWeighbridgeReadingDto, rest);
    }
  });
});
