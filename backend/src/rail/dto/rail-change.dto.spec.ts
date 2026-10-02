import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AllocatePartyDto, CreateChangeRequestDto, PreviewChangeRequestDto, ProposeAlternativeDto } from './rail-change.dto';

// the production pipe settings (backend/src/main.ts)
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: true } });
const run = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype });
const bad = (metatype: any, value: unknown) => expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);

const base = { kind: 'CANCEL', initiatedBy: 'TOC', cancellationCode: 'CNX-001', trainSlotRef: 'T-100' };

describe('CreateChangeRequestDto (Annexure 20a cancel / reschedule / re-plan)', () => {
  it('accepts a minimal and a full request', async () => {
    await expect(run(CreateChangeRequestDto, base)).resolves.toMatchObject({ cancellationCode: 'CNX-001' });
    await expect(run(CreateChangeRequestDto, {
      kind: 'RESCHEDULE', initiatedBy: 'YARD_OPERATOR', cancellationCode: 'CNX-082', trainSlotRef: 'T-100 / Ore-14', consignmentId: 'ckabc123', slotApplicationId: 'ckdef456',
      handshakeReportId: 'ckghi789', originalDeparture: '2026-10-05T06:00:00Z', proposedDeparture: '2026-10-05T18:00:00Z', eventOccurredAt: '2026-10-02T09:50:00Z',
      isPlannedOccupation: true, requiresStaging: false, note: 'Staging at Hotazel',
    })).resolves.toBeDefined();
  });

  it.each(['CANCEL', 'RESCHEDULE', 'REPLAN'])('accepts kind %s', async (kind) => {
    await expect(run(CreateChangeRequestDto, { ...base, kind })).resolves.toBeDefined();
  });

  it.each(['TOC', 'YARD_OPERATOR', 'TRIM', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM'])('accepts initiator %s (Annexure 20a lists these initiating parties)', async (initiatedBy) => {
    await expect(run(CreateChangeRequestDto, { ...base, initiatedBy })).resolves.toBeDefined();
  });

  it('DOES NOT let the client choose its own penalty: attribution, force-majeure flag, consequence, notice band, status, tenant … are all stripped', async () => {
    const out: any = await run(CreateChangeRequestDto, {
      ...base, attribution: 'FORCE_MAJEURE', isForceMajeure: true, consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false, penaltyAgainst: null,
      penaltyBasis: 'trust me', noticeBand: 'PLANNING_VERSION', commercialWindow: 'OUTSIDE_72H', hoursBeforeDeparture: 999, codeResponsibleParty: 'FORCE_MAJEURE',
      cancellationReason: 'made up', status: 'CLOSED', companyId: 'EVIL', requestNumber: 'CR-1', acknowledgedAt: '2026-01-01', replacementAccepted: true, createdById: 'x',
    });
    expect(Object.keys(out).sort()).toEqual(['cancellationCode', 'initiatedBy', 'kind', 'trainSlotRef']);
  });

  it.each([
    ['an unknown kind', { kind: 'DELETE' }],
    ['a lower-case kind', { kind: 'cancel' }],
    ['an unknown initiator', { initiatedBy: 'REGULATOR' }],
    ['a lower-case code', { cancellationCode: 'cnx-001' }],
    ['a code that is too short', { cancellationCode: 'CNX-1' }],
    ['a code that is too long', { cancellationCode: 'CNX-0001' }],
    ['a code with trailing text', { cancellationCode: 'CNX-001; DROP TABLE' }],
    ['a code with a leading space', { cancellationCode: ' CNX-001' }],
    ['an object as the code (it would otherwise become "[object Object]")', { cancellationCode: { $ne: 'x' } }],
    ['a number as the code', { cancellationCode: 1 }],
    ['an empty train slot reference', { trainSlotRef: '' }],
    ['an over-long train slot reference', { trainSlotRef: 'x'.repeat(121) }],
    ['an object as the train slot reference', { trainSlotRef: { a: 1 } }],
    ['an unparseable departure', { originalDeparture: 'next tuesday' }],
    ['an unparseable proposed departure', { proposedDeparture: '31/31/2026' }],
    ['an unparseable event time', { eventOccurredAt: 'earlier' }],
    ['the STRING "false" for planned occupation (it would be coerced to true and waive a refund)', { isPlannedOccupation: 'false' }],
    ['a number for planned occupation', { isPlannedOccupation: 0 }],
    ['the string "false" for requiresStaging', { requiresStaging: 'false' }],
    ['an over-long note', { note: 'x'.repeat(2001) }],
    ['an object as the note', { note: { evil: true } }],
    ['an over-long consignment id', { consignmentId: 'x'.repeat(61) }],
    ['an object as the handshake report id', { handshakeReportId: { id: 1 } }],
  ])('rejects %s', async (_l, extra) => bad(CreateChangeRequestDto, { ...base, ...extra }));

  it('requires kind, initiator, code and slot reference', async () => {
    for (const k of Object.keys(base)) {
      const { [k]: _omit, ...rest } = base as Record<string, string>;
      await bad(CreateChangeRequestDto, rest);
    }
  });

  it('keeps real booleans as booleans', async () => {
    const out: any = await run(CreateChangeRequestDto, { ...base, isPlannedOccupation: false, requiresStaging: true });
    expect(out).toMatchObject({ isPlannedOccupation: false, requiresStaging: true });
  });
});

describe('PreviewChangeRequestDto', () => {
  it('is the same contract as create (the modal previews with exactly what it will submit)', async () => {
    await expect(run(PreviewChangeRequestDto, base)).resolves.toBeDefined();
    await bad(PreviewChangeRequestDto, { ...base, cancellationCode: 'nope' });
    const out: any = await run(PreviewChangeRequestDto, { ...base, attribution: 'TOC' });
    expect(out).not.toHaveProperty('attribution');
  });
});

describe('ProposeAlternativeDto', () => {
  it('needs a valid proposed departure; the note is optional', async () => {
    await expect(run(ProposeAlternativeDto, { proposedDeparture: '2026-10-06T08:00:00Z' })).resolves.toBeDefined();
    await expect(run(ProposeAlternativeDto, { proposedDeparture: '2026-10-06T08:00:00Z', note: 'Path 22:00' })).resolves.toBeDefined();
    await bad(ProposeAlternativeDto, {});
    await bad(ProposeAlternativeDto, { proposedDeparture: 'soon' });
    await bad(ProposeAlternativeDto, { proposedDeparture: '2026-10-06T08:00:00Z', note: 'x'.repeat(2001) });
    await bad(ProposeAlternativeDto, { proposedDeparture: '2026-10-06T08:00:00Z', note: { x: 1 } });
  });
});

describe('AllocatePartyDto (the Clearinghouse allocation of a "could be …" reason)', () => {
  it.each(['TRIM', 'TOC', 'FORCE_MAJEURE'])('accepts %s with a reference', async (attribution) => {
    await expect(run(AllocatePartyDto, { attribution, note: 'CH-2026-114' })).resolves.toMatchObject({ attribution });
  });
  it.each([
    ['UNDETERMINED (that is the absence of a decision)', { attribution: 'UNDETERMINED', note: 'CH-1' }],
    ['a lower-case party', { attribution: 'toc', note: 'CH-1' }],
    ['no party', { note: 'CH-1' }],
    ['no reference', { attribution: 'TOC' }],
    ['a reference shorter than 3 characters', { attribution: 'TOC', note: 'ab' }],
    ['an over-long reference', { attribution: 'TOC', note: 'x'.repeat(2001) }],
    ['an object as the reference', { attribution: 'TOC', note: { x: 1 } }],
  ])('rejects %s', async (_l, body) => bad(AllocatePartyDto, body));
});
