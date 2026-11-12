import 'reflect-metadata'; // must precede class-transformer's decorators
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CommitInboxDto,
  CreateWaybillDto,
  RecordDeliveryDto,
  UpdateWaybillDto,
  WAYBILL_PATCHABLE,
} from './waybill.dto';

/**
 * The edge of the waybill module.
 *
 * `WaybillsService.create()` spreads the body straight into a Prisma write and
 * only overwrites `trackingNumber` and `companyId` afterwards, so with
 * `@Body() body: any` every other column was caller-controlled at creation
 * time — including `ratingToken`, which is the bearer token behind the
 * customer's public rating link, and the POD columns, which are the proof that
 * a parcel was delivered.
 *
 * The point of these tests is what does NOT survive validation.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const BOOKING = {
  senderName: 'Acme Warehouse',
  senderPhone: '+27110000001',
  senderAddress: '1 Industrial Rd, Johannesburg',
  recipientName: 'Thabo Mokoena',
  recipientPhone: '+27110000002',
  recipientAddress: '42 Beach Rd, Cape Town',
};

describe('CreateWaybillDto', () => {
  it('accepts a well-formed booking', async () => {
    const dto = await through(CreateWaybillDto, { ...BOOKING, weight: 12.5, totalAmount: 340 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a status, because OCR capture books already-delivered waybills', async () => {
    // WaybillCapture posts status: "DELIVERED" for a scanned paper waybill.
    const dto = await through(CreateWaybillDto, { ...BOOKING, status: 'DELIVERED' });
    expect(await errorsFor(dto)).toEqual([]);
    expect((dto as { status?: string }).status).toEqual('DELIVERED');
  });

  it('rejects a status outside the lifecycle', async () => {
    const dto = await through(CreateWaybillDto, { ...BOOKING, status: 'NOT_A_STATUS' });
    expect(await errorsFor(dto)).toContain('status');
  });

  it('rejects a negative weight', async () => {
    // #512's shape: nothing checked the number until it had been multiplied by
    // a price. The service still checks; this is the earlier edge.
    const dto = await through(CreateWaybillDto, { ...BOOKING, weight: -5 });
    expect(await errorsFor(dto)).toContain('weight');
  });

  it('does not let a caller choose the rating bearer token', async () => {
    // ratingToken is stripped from every response by withoutRatingToken because
    // it is the capability behind the customer's public rating link. Being able
    // to set it at create time means holding it — and therefore forging the
    // customer's rating.
    const dto = (await through(CreateWaybillDto, {
      ...BOOKING,
      ratingToken: 'token-i-choose',
    })) as unknown as Record<string, unknown>;
    expect(dto.ratingToken).toBeUndefined();
  });

  it('does not let a caller forge proof of delivery at creation', async () => {
    const dto = (await through(CreateWaybillDto, {
      ...BOOKING,
      podImageUrl: 'https://cdn.example/fake.png',
      podSignatureUrl: 'https://cdn.example/fake-sig.png',
      podRecipient: 'Someone',
      podDeliveredAt: '2026-01-01T00:00:00Z',
    })) as unknown as Record<string, unknown>;

    for (const stripped of [
      'podImageUrl',
      'podSignatureUrl',
      'podRecipient',
      'podDeliveredAt',
    ]) {
      expect(dto[stripped]).toBeUndefined();
    }
  });

  it('does not let a caller set the cash-reconciliation or feedback columns', async () => {
    const dto = (await through(CreateWaybillDto, {
      ...BOOKING,
      codCollected: true,
      codCollectedAmount: 9999,
      codDiscrepancy: -9999,
      customerRating: 5,
      customerRatingNote: 'planted',
      id: 'attacker-id',
      trackingNumber: 'WB-ATTACKER',
      riskScore: 0,
    })) as unknown as Record<string, unknown>;

    for (const stripped of [
      'codCollected',
      'codCollectedAmount',
      'codDiscrepancy',
      'customerRating',
      'customerRatingNote',
      'id',
      'trackingNumber',
      'riskScore',
    ]) {
      expect(dto[stripped]).toBeUndefined();
    }
  });

  it('rejects a missing required party', async () => {
    const { recipientName, ...rest } = BOOKING;
    const dto = await through(CreateWaybillDto, rest);
    expect(await errorsFor(dto)).toContain('recipientName');
  });
});

describe('UpdateWaybillDto stays in step with the service allowlist', () => {
  // The service guards the patch with WAYBILL_PATCHABLE_FIELDS and the DTO
  // guards the edge. If they drift, one silently permits what the other denies
  // and the effective rule becomes whichever list you happen to read.
  it('names exactly the fields WAYBILL_PATCHABLE_FIELDS allows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/waybills/waybills.service.ts'),
      'utf8',
    );
    const block = source.slice(
      source.indexOf('const WAYBILL_PATCHABLE_FIELDS = ['),
      source.indexOf('] as const;', source.indexOf('const WAYBILL_PATCHABLE_FIELDS = [')),
    );
    const serviceFields = [...block.matchAll(/'([^']+)'/g)]
      .map((m) => m[1])
      .filter((f) => f !== 'as const');

    expect(serviceFields.length).toBeGreaterThan(10);
    expect([...WAYBILL_PATCHABLE].sort()).toEqual([...serviceFields].sort());
  });

  it('actually declares every allowed field, not just lists it', async () => {
    // The const above could claim anything. This proves the class carries a
    // decorated property for each one — a field that is listed but never
    // declared would be stripped by the whitelist, so the service would allow
    // a write the edge silently discarded.
    const missing: string[] = [];
    for (const field of WAYBILL_PATCHABLE) {
      const dto = (await through(UpdateWaybillDto, { [field]: 'x' })) as unknown as Record<
        string,
        unknown
      >;
      if (dto[field] === undefined) missing.push(field);
    }
    expect(missing).toEqual([]);
  });
});

describe('RecordDeliveryDto', () => {
  it('requires a recipient', async () => {
    const dto = await through(RecordDeliveryDto, {});
    expect(await errorsFor(dto)).toContain('recipient');
  });

  it('accepts a JSON-string scannedCodes field from multipart', async () => {
    // Multipart has no types: everything arrives as a string. The service
    // tolerates both shapes; this normalises before validation so the array
    // check is meaningful.
    const dto = await through(RecordDeliveryDto, {
      recipient: 'Thabo Mokoena',
      scannedCodes: '["WB-1","WB-2"]',
    });
    expect(await errorsFor(dto)).toEqual([]);
    expect((dto as { scannedCodes?: string[] }).scannedCodes).toEqual(['WB-1', 'WB-2']);
  });

  it('accepts a bare code that is not valid JSON', async () => {
    const dto = await through(RecordDeliveryDto, {
      recipient: 'Thabo Mokoena',
      scannedCodes: 'WB-9',
    });
    expect((dto as { scannedCodes?: string[] }).scannedCodes).toEqual(['WB-9']);
  });
});

describe('CommitInboxDto', () => {
  it('accepts override fields', async () => {
    const dto = await through(CommitInboxDto, { recipientName: 'Thabo', weight: 4 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('does not let an override smuggle in a rating token or POD', async () => {
    // Overrides are merged over the OCR data and handed to create(), so this
    // is the same exposure as CreateWaybillDto.
    const dto = (await through(CommitInboxDto, {
      ratingToken: 'token-i-choose',
      podImageUrl: 'https://cdn.example/fake.png',
      codCollected: true,
    })) as unknown as Record<string, unknown>;

    for (const stripped of ['ratingToken', 'podImageUrl', 'codCollected']) {
      expect(dto[stripped]).toBeUndefined();
    }
  });
});
