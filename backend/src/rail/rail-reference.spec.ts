/**
 * Reference catalogs extracted from the supplied annexures (20a, 20b, 25, 40) and the corridor /
 * yard catalogs. These tests pin the exact shape of what was transcribed, and the honest state of
 * the data that was NOT supplied.
 */
import { UserRole } from '@prisma/client';
import { RailElectrification, RailGauge, RailVehicleProfile, RailComplianceDocType } from '@prisma/client';
import {
  CANCELLATION_CODE_CATALOG, findCancellationCode, parseAnnexure20bParty,
} from './catalog/cancellation-codes.catalog';
import { ANCILLARY_SERVICE_CATALOG, findAncillaryService } from './catalog/ancillary-services.catalog';
import {
  SELF_SCREENING_QUESTIONS, SelfScreeningAnswer, evaluateSelfScreening,
} from './catalog/self-screening.catalog';
import {
  ANNEXURE_20A_TIMINGS, ANNEXURE_21_RULES, CANCELLATION_INITIATORS, CANCELLATION_PROCESS_STEPS,
} from './catalog/cancellation-process.catalog';
import { CORRIDOR_CATALOG, NETWORK_CONTACTS } from './catalog/corridors.catalog';
import { EXPECTED_CORRIDOR_COUNT, EXPECTED_TRANSFER_YARD_COUNT, YARD_CATALOG } from './catalog/yards.catalog';
import {
  RAIL_AXLE_LOAD_CLASSES_T, RAIL_COMPLIANCE_DOC_TYPES, RAIL_ELECTRIFICATION_VALUES, RAIL_GAUGE_VALUES,
  RAIL_VEHICLE_PROFILE_VALUES, resolveCorridor, validateReferenceEntry, ReferenceEnvelopeFields,
} from './rail-reference';

void UserRole;

describe('vocabulary mirrors the Prisma enums (drift guard)', () => {
  it('gauge / electrification / profile / document types match the schema exactly', () => {
    expect([...RAIL_GAUGE_VALUES].sort()).toEqual(Object.values(RailGauge).sort());
    expect([...RAIL_ELECTRIFICATION_VALUES].sort()).toEqual(Object.values(RailElectrification).sort());
    expect([...RAIL_VEHICLE_PROFILE_VALUES].sort()).toEqual(Object.values(RailVehicleProfile).sort());
    expect([...RAIL_COMPLIANCE_DOC_TYPES].sort()).toEqual(Object.values(RailComplianceDocType).sort());
  });
  it('the brief\'s value sets are all present', () => {
    expect(RAIL_GAUGE_VALUES).toHaveLength(3); // 1067 / 610 / 1435 mm
    expect(RAIL_ELECTRIFICATION_VALUES).toHaveLength(4); // 3kV DC / 25kV AC / 50kV AC / Diesel
    expect(RAIL_VEHICLE_PROFILE_VALUES).toEqual(['A', 'B', 'B_PLUS_1']);
    // 20/26/30 came from the brief; 16.5 and 18.5 are what Network Statement Chapter 2
    // actually states (Cape §2.11.1.6, North §2.8.1.6, North-East §2.10.1.6).
    expect(RAIL_AXLE_LOAD_CLASSES_T).toEqual([16.5, 18.5, 20, 26, 30]);
    expect(RAIL_COMPLIANCE_DOC_TYPES).toHaveLength(8);
  });
});

describe('Annexure 20b — cancellation reasons (v1.3)', () => {
  it('has all 82 rows, in source order, with unique CNX-nnn codes', () => {
    expect(CANCELLATION_CODE_CATALOG).toHaveLength(82);
    expect(new Set(CANCELLATION_CODE_CATALOG.map((c) => c.code)).size).toBe(82);
    CANCELLATION_CODE_CATALOG.forEach((c, i) => {
      expect(c.sourceRow).toBe(i + 1);
      expect(c.code).toBe(`CNX-${String(i + 1).padStart(3, '0')}`);
    });
    expect(CANCELLATION_CODE_CATALOG[0].reason).toBe('Abnormal working / yard');
    expect(CANCELLATION_CODE_CATALOG[81].reason).toBe('Yard Derailment');
  });

  it('splits 37 Rail Operations / 29 Infrastructure Manager / 6 Force Majeure / 10 "could be"', () => {
    const n = (p: string) => CANCELLATION_CODE_CATALOG.filter((c) => c.responsibleParty === p).length;
    expect(n('RAIL_OPERATIONS')).toBe(37);
    expect(n('INFRASTRUCTURE_MANAGER')).toBe(29);
    expect(n('FORCE_MAJEURE')).toBe(6);
    expect(n('ALLOCATION_REQUIRED')).toBe(10);
  });

  it('keeps awkward wording verbatim', () => {
    const reasons = CANCELLATION_CODE_CATALOG.map((c) => c.reason);
    for (const r of ["Removal of Not-to-Go's", 'Over- / Skew Loading', 'Carriage & Wagons related', 'Weigh Bridge not functioning / not calibrated',
      'Dangerous Goods / Environmental Spillage and Leakage related', 'Non compliance to plans (ITP, YPP)', 'Port issues (TPT)']) {
      expect(reasons).toContain(r);
    }
  });

  it('"Could be …" rows are never defaulted to a party — they need Clearinghouse allocation', () => {
    const derailment = CANCELLATION_CODE_CATALOG.find((c) => c.reason === 'Derailment')!;
    expect(derailment.responsibleParty).toBe('ALLOCATION_REQUIRED');
    expect(derailment.possibleParties).toEqual(['FORCE_MAJEURE', 'INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS']);
    const hookUp = CANCELLATION_CODE_CATALOG.find((c) => c.reason === 'Hook-up')!;
    expect(hookUp.possibleParties).toEqual(['INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS']);
    for (const c of CANCELLATION_CODE_CATALOG.filter((x) => x.responsibleParty !== 'ALLOCATION_REQUIRED')) expect(c.possibleParties).toEqual([]);
  });

  it('a yard derailment is Rail Operations while a plain derailment is undetermined (the source distinguishes them)', () => {
    expect(CANCELLATION_CODE_CATALOG.find((c) => c.reason === 'Yard Derailment')!.responsibleParty).toBe('RAIL_OPERATIONS');
  });

  it('parses only the vocabulary the annexure used, and fails loudly otherwise', () => {
    expect(parseAnnexure20bParty('Force Majeure')).toEqual({ responsibleParty: 'FORCE_MAJEURE', possibleParties: [] });
    expect(() => parseAnnexure20bParty('Somebody Else')).toThrow(/unrecognised responsible party/);
    expect(() => parseAnnexure20bParty('Could be Magic or Rail Operations')).toThrow(/unrecognised party/);
  });

  it('looks codes up', () => {
    expect(findCancellationCode('CNX-071')?.reason).toBe('SPAD');
    expect(findCancellationCode('CNX-999')).toBeUndefined();
  });
});

describe('Annexure 40 — ancillary services catalogue 2026/27', () => {
  it('covers the 40 numbered services (1–40) with 113 priced lines and unique codes', () => {
    expect(new Set(ANCILLARY_SERVICE_CATALOG.map((s) => s.serviceNumber))).toEqual(new Set(Array.from({ length: 40 }, (_, i) => i + 1)));
    expect(ANCILLARY_SERVICE_CATALOG).toHaveLength(113);
    expect(new Set(ANCILLARY_SERVICE_CATALOG.map((s) => s.code)).size).toBe(113);
  });

  it('has the four tiers with 7 / 4 / 17 / 85 lines; only Tier 1 is compulsory', () => {
    const lines = (t: number) => ANCILLARY_SERVICE_CATALOG.filter((s) => s.tier === t);
    expect([1, 2, 3, 4].map((t) => lines(t).length)).toEqual([7, 4, 17, 85]);
    expect(ANCILLARY_SERVICE_CATALOG.every((s) => s.isCompulsory === (s.tier === 1))).toBe(true);
    expect(lines(1)[0].tierName).toBe('INFRASTRUCTURE ACCESS SERVICES');
  });

  it('publishes NO prices: nothing carries a rate, and TBD is not zero', () => {
    for (const s of ANCILLARY_SERVICE_CATALOG) {
      expect(Object.keys(s).some((k) => /rate|price|zar|amount/i.test(k.replace('priceStatus', '')))).toBe(false);
      expect(['NOT_PUBLISHED', 'TBD']).toContain(s.priceStatus);
    }
    const tbd = ANCILLARY_SERVICE_CATALOG.filter((s) => s.priceStatus === 'TBD');
    expect(tbd).toHaveLength(8);
    expect(tbd.map((s) => s.serviceNumber).sort((a, b) => a - b)).toEqual([34, 34, 34, 34, 34, 34, 34, 40]);
  });

  it('keeps unit-of-measure text verbatim', () => {
    expect(findAncillaryService('ANX40-01')?.unitOfMeasure).toBe('Per wagon movement (varies per train category: GF <50 wagons; Medium heavy >50 <100; heavy >100)');
    expect(findAncillaryService('ANX40-14')?.unitOfMeasure).toBe('Subscription Per annum (Fee covers all revisions in that year)');
    expect(ANCILLARY_SERVICE_CATALOG.filter((s) => s.serviceNumber === 35).every((s) => s.unitOfMeasure.length > 0)).toBe(true);
    expect(ANCILLARY_SERVICE_CATALOG.find((s) => s.name === 'Use of specialist vehicle')?.unitOfMeasure).toBe('Per call-out (first 30mnts) / Per vehicle per hour');
  });

  it('breaks multi-line services into one line each (4a–4d, 26: 3, 30: 9, 31: 8, 35: 19)', () => {
    const count = (n: number) => ANCILLARY_SERVICE_CATALOG.filter((s) => s.serviceNumber === n).length;
    expect([count(4), count(26), count(27), count(30), count(31), count(35)]).toEqual([4, 3, 13, 9, 8, 19]);
    expect(ANCILLARY_SERVICE_CATALOG.filter((s) => s.serviceNumber === 4).map((s) => s.sourceLabel)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('assigns the four groups', () => {
    const groups = new Set(ANCILLARY_SERVICE_CATALOG.map((s) => s.group));
    expect(groups).toEqual(new Set(['RAIL', 'TELECOMS', 'SAFETY_EMERGENCY', 'PROPERTY']));
    expect(ANCILLARY_SERVICE_CATALOG.find((s) => s.serviceNumber === 39)?.group).toBe('PROPERTY');
  });
});

describe('Annexure 25 — self-screening (Second Draft)', () => {
  const answerAll = (v: 'YES' | 'NO', remarks?: string): SelfScreeningAnswer[] => SELF_SCREENING_QUESTIONS.map((q) => ({ no: q.no, answer: v, remarks }));

  it('has the seven questions (i)–(vii)', () => {
    expect(SELF_SCREENING_QUESTIONS.map((q) => q.no)).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']);
    expect(SELF_SCREENING_QUESTIONS[4].assessment).toContain('SANS 3000-4');
    expect(SELF_SCREENING_QUESTIONS[6].refers).toContain('Annexure 34');
  });
  it('is incomplete until every question is answered', () => {
    expect(evaluateSelfScreening(null).complete).toBe(false);
    expect(evaluateSelfScreening([]).unanswered).toHaveLength(7);
    expect(evaluateSelfScreening(answerAll('YES').slice(0, 6)).unanswered).toEqual(['vii']);
  });
  it('a full set of YES answers is complete with nothing flagged', () => {
    expect(evaluateSelfScreening(answerAll('YES'))).toEqual({ complete: true, unanswered: [], flagged: [], missingRemarks: [], unknownQuestions: [] });
  });
  it('a NO is flagged for the IM and needs remarks — but does not block completeness', () => {
    const a = answerAll('YES');
    a[1] = { no: 'ii', answer: 'NO' };
    const r = evaluateSelfScreening(a);
    expect(r.complete).toBe(true);
    expect(r.flagged).toEqual(['ii']);
    expect(r.missingRemarks).toEqual(['ii']);
    a[1] = { no: 'ii', answer: 'NO', remarks: 'Leased stock arrives in Q2' };
    expect(evaluateSelfScreening(a).missingRemarks).toEqual([]);
  });
  it('an answer to a question the form does not have makes it incomplete', () => {
    expect(evaluateSelfScreening([...answerAll('YES'), { no: 'viii', answer: 'YES' }]).complete).toBe(false);
  });
});

describe('Annexure 20a / 21 — process and timings', () => {
  it('records 24 contiguous steps; step 22 is flagged as an inferred number', () => {
    expect(CANCELLATION_PROCESS_STEPS.map((s) => s.step)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(CANCELLATION_PROCESS_STEPS.filter((s) => s.stepNumberInferred).map((s) => s.step)).toEqual([22]);
  });
  it('has the five initiators of steps 1–5', () => {
    expect(CANCELLATION_INITIATORS.map((i) => i.value)).toEqual(['TOC', 'YARD_OPERATOR', 'TRIM', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM']);
  });
  it('quotes the timings exactly (15 minutes, 1 hour, 48 hours) and the Clearinghouse windows (24 h / 48 h)', () => {
    expect(ANNEXURE_20A_TIMINGS).toEqual({ noticeWithinMinutes: 15, acknowledgeWithinHours: 1, shortNoticeThresholdHours: 48 });
    expect(ANNEXURE_21_RULES.disputeWindowHours).toBe(24);
    expect(ANNEXURE_21_RULES.closedToDisputeAfterHours).toBe(48);
    expect(ANNEXURE_21_RULES.nationalClearinghouse).toEqual({ tueToFri: '12:00', monday: '10:30' });
  });
  it('does not carry the personal data of the sign-off blocks (POPIA / EXC-022): roles only', () => {
    const dump = JSON.stringify([CANCELLATION_PROCESS_STEPS, CANCELLATION_INITIATORS]);
    expect(dump).not.toMatch(/\\\\A00|Process_Management|Process_Repository/i); // the internal server path is omitted too
  });
});

describe('corridor and yard catalogs — only what is evidenced', () => {
  it('has the six V4 corridors', () => {
    expect(CORRIDOR_CATALOG).toHaveLength(EXPECTED_CORRIDOR_COUNT);
    expect(CORRIDOR_CATALOG.map((c) => c.name).sort()).toEqual(['Cape', 'Central', 'Container', 'North', 'North-East', 'Ore']);
    expect(new Set(CORRIDOR_CATALOG.map((c) => c.code)).size).toBe(6);
  });

  /**
   * The invariant this test protects is "NO technical data is invented" — not "every field is
   * empty". Those used to be the same thing, because Network Statement Chapter 2 had never
   * been supplied. It has now: §2.8–2.13 give the envelope, so the honest state is no longer
   * "nothing is known" but "what is known is cited, and what is not stated stays empty".
   *
   * So the test now checks provenance rather than emptiness.
   */
  it('NO technical data is invented: every loaded envelope value is cited, and the rest is empty', () => {
    for (const c of CORRIDOR_CATALOG) {
      // Every corridor cites the chapter and section its numbers came from.
      expect(c.sourceRef).toMatch(/Network Statement/i);
      expect(c.sourceRef).toMatch(/§2\.(8|9|10|11|12|13)/);
      // Chapter 2 defers the vehicle gauge to Annexures 2 and 3, which were not supplied,
      // so no corridor may claim one or claim to be fully verified.
      expect(c.vehicleProfile).toBeNull();
      expect(c.dataStatus).not.toBe('VERIFIED');
      expect(c.verifiedBy).toBeNull();
      // Every value that IS set must come from a vocabulary the document states.
      if (c.gauge !== null) expect(RAIL_GAUGE_VALUES).toContain(c.gauge);
      if (c.maxAxleLoadTonnes !== null) expect(RAIL_AXLE_LOAD_CLASSES_T).toContain(c.maxAxleLoadTonnes);
      for (const t of c.electrification) expect(RAIL_ELECTRIFICATION_VALUES).toContain(t as RailElectrification);
      for (const e of c.envelopeExceptions ?? []) {
        if (e.tonnes !== undefined) expect(RAIL_AXLE_LOAD_CLASSES_T).toContain(e.tonnes);
        if (e.gauge !== undefined) expect(RAIL_GAUGE_VALUES).toContain(e.gauge);
      }
    }
  });

  it('loads the envelope Chapter 2 actually states, per corridor', () => {
    const table = Object.fromEntries(CORRIDOR_CATALOG.map((c) => [c.code, c]));
    // gauge (all Cape gauge) / axle load / train length — NS V4 §2.8–2.13.
    expect(table['COR-NORTH']).toMatchObject({ maxAxleLoadTonnes: 20, maxTrainLengthM: 2000 });
    expect(table['COR-ORE']).toMatchObject({ maxAxleLoadTonnes: 30, maxTrainLengthM: null });
    expect(table['COR-NORTH-EAST']).toMatchObject({ maxAxleLoadTonnes: 20, maxTrainLengthM: 1600 });
    expect(table['COR-CAPE']).toMatchObject({ maxAxleLoadTonnes: 20, maxTrainLengthM: 1150 });
    expect(table['COR-CENTRAL']).toMatchObject({ maxAxleLoadTonnes: 20, maxTrainLengthM: 1200 });
    expect(table['COR-CONTAINER']).toMatchObject({ maxAxleLoadTonnes: 20, maxTrainLengthM: 1200 });
    // Ore is the only 50 kV AC corridor; it is also the only one stated with no train length.
    expect(table['COR-ORE'].electrification).toEqual(['AC_50KV']);
  });

  it('seeds ZERO yards — the 11 transfer yards were never supplied (surfaced, not hidden)', () => {
    expect(YARD_CATALOG).toHaveLength(0);
    expect(EXPECTED_TRANSFER_YARD_COUNT).toBe(11);
  });

  it('every catalog entry passes validation; the contact directory holds mailboxes, not people', () => {
    for (const c of CORRIDOR_CATALOG) expect(validateReferenceEntry(c)).toEqual([]);
    expect(NETWORK_CONTACTS.every((c) => /^[^@\s]+@[^@\s]+$/.test(c.email ?? ''))).toBe(true);
    expect(NETWORK_CONTACTS.every((c) => !('name' in c))).toBe(true);
  });

  it('pre-V4 names and Annexure 33b route names resolve to the right corridor', () => {
    expect(resolveCorridor(CORRIDOR_CATALOG, 'Natal')?.code).toBe('COR-CONTAINER');
    expect(resolveCorridor(CORRIDOR_CATALOG, 'cape 2')?.code).toBe('COR-ORE');
    expect(resolveCorridor(CORRIDOR_CATALOG, ' Northern ')?.code).toBe('COR-NORTH');
    expect(resolveCorridor(CORRIDOR_CATALOG, 'Magnetite')?.code).toBe('COR-NORTH-EAST');
    expect(resolveCorridor(CORRIDOR_CATALOG, 'General Freight: Mafikeng to Beaconsfield/Potchefstroom')?.code).toBe('COR-CENTRAL');
    expect(resolveCorridor(CORRIDOR_CATALOG, 'COR-ORE')?.code).toBe('COR-ORE');
  });
  it('does not guess: an unknown or partial name resolves to nothing', () => {
    expect(resolveCorridor(CORRIDOR_CATALOG, 'Coal Line')).toBeUndefined();
    expect(resolveCorridor(CORRIDOR_CATALOG, 'Ore line extension')).toBeUndefined();
    expect(resolveCorridor(CORRIDOR_CATALOG, '')).toBeUndefined();
    expect(resolveCorridor(CORRIDOR_CATALOG, null)).toBeUndefined();
  });
});

describe('validateReferenceEntry', () => {
  const ok: ReferenceEnvelopeFields = {
    code: 'COR-X', name: 'X', gauge: 'CAPE_1067MM', electrification: ['DC_3KV', 'DIESEL'], maxAxleLoadTonnes: 26,
    vehicleProfile: 'B', maxTrainLengthM: 1500, sidingCapacityWagons: 80, contacts: [{ role: 'Control office', email: 'control@example.org' }],
    dataStatus: 'VERIFIED', sourceRef: 'NS V4 §2.1 table 3', verifiedBy: 'reviewer-role',
  };
  it('accepts a complete verified entry', () => expect(validateReferenceEntry(ok)).toEqual([]));
  it.each([20, 26, 30])('accepts the %d t axle-load class', (t) => expect(validateReferenceEntry({ ...ok, maxAxleLoadTonnes: t })).toEqual([]));
  it('rejects an axle load outside 20 / 26 / 30', () => {
    expect(validateReferenceEntry({ ...ok, maxAxleLoadTonnes: 22.5 }).join()).toMatch(/22.5.*20\/26\/30/);
  });
  it('rejects unknown gauge, electrification and profile values', () => {
    expect(validateReferenceEntry({ ...ok, gauge: 'G1067' as never }).join()).toMatch(/gauge/);
    expect(validateReferenceEntry({ ...ok, electrification: ['15KV_DC'] }).join()).toMatch(/electrification "15KV_DC"/);
    expect(validateReferenceEntry({ ...ok, vehicleProfile: 'C' as never }).join()).toMatch(/vehicleProfile/);
  });
  it('rejects non-positive or fractional lengths and capacities', () => {
    expect(validateReferenceEntry({ ...ok, maxTrainLengthM: 0 }).join()).toMatch(/maxTrainLengthM/);
    expect(validateReferenceEntry({ ...ok, sidingCapacityWagons: 12.5 }).join()).toMatch(/sidingCapacityWagons/);
  });
  it('VERIFIED must be complete, cited and reviewed', () => {
    const problems = validateReferenceEntry({ ...ok, gauge: null, electrification: [], maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null, sourceRef: '', verifiedBy: null }).join('|');
    for (const f of ['gauge', 'electrification', 'maxAxleLoadTonnes', 'vehicleProfile', 'maxTrainLengthM', 'sourceRef', 'verifiedBy']) expect(problems).toContain(`VERIFIED requires ${f}`);
  });
  it('rejects a personal-name key in the contact directory (POPIA)', () => {
    const p = validateReferenceEntry({ ...ok, contacts: [{ role: 'Control office', name: 'Jane Citizen' } as never] }).join();
    expect(p).toMatch(/key "name".*no personal names/);
  });
  it('rejects a lower-case or malformed code', () => {
    expect(validateReferenceEntry({ ...ok, code: 'cor_x' }).join()).toMatch(/UPPER-KEBAB/);
  });
});
