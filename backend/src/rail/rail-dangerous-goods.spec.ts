import {
  DG_MANDATORY_FIELDS, evaluateDangerousGoods, isMovementStatus, normaliseUnNumber, validateDgField, DgCarrier,
} from './rail-dangerous-goods';

const COMPLETE = {
  unNumber: 'UN1203', imdgClass: '3', placardRef: 'PL-3-FLAMMABLE', emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: 'https://files.example.org/msds/1203.pdf',
};
const con = (over: DgCarrier & { consignmentNumber?: string } = {}) => ({ consignmentNumber: 'RAIL-2026-00001', isDangerousGoods: true, ...COMPLETE, ...over });
const wagon = (n: string, over: DgCarrier = {}) => ({ wagonNumber: n, isDangerousGoods: false, ...over });

describe('mandatory fields', () => {
  it('are the brief\'s five', () => expect([...DG_MANDATORY_FIELDS]).toEqual(['unNumber', 'imdgClass', 'placardRef', 'emergencyContact24h', 'msdsDocumentUrl']));
});

describe('normaliseUnNumber', () => {
  it.each([['1203', 'UN1203'], ['un1203', 'UN1203'], ['UN 1203', 'UN1203'], [' u n 1203 ', 'UN1203'], ['UN1203', 'UN1203']])('%j → %j', (i, o) => expect(normaliseUnNumber(i)).toBe(o));
  it('passes malformed input through (upper-cased) for the validator to reject, and nulls blanks', () => {
    expect(normaliseUnNumber('abc')).toBe('ABC');
    expect(normaliseUnNumber('12345')).toBe('12345');
    expect(normaliseUnNumber('')).toBeNull();
    expect(normaliseUnNumber(undefined)).toBeNull();
  });
});

describe('validateDgField', () => {
  it.each([
    ['unNumber', 'UN1203', true], ['unNumber', 'UN12', false], ['unNumber', '1203', false], ['unNumber', 'UN12034', false],
    ['imdgClass', '3', true], ['imdgClass', '2.1', true], ['imdgClass', '6.1', true], ['imdgClass', '1.4S', true], ['imdgClass', '9', true], ['imdgClass', '0', false], ['imdgClass', '10', false], ['imdgClass', '1.7', false], ['imdgClass', 'flammable', false],
    ['placardRef', 'PL-3', true], ['placardRef', 'x'.repeat(61), false],
    ['emergencyContact24h', '+27 11 555 0100', true], ['emergencyContact24h', '0115550100', true], ['emergencyContact24h', '(011) 555-0100', true], ['emergencyContact24h', '+27 (0) 11 555 0100', true], ['emergencyContact24h', '((011) 555', false], ['emergencyContact24h', 'call Bob', false], ['emergencyContact24h', '123', false],
    ['msdsDocumentUrl', 'https://x.org/a.pdf', true], ['msdsDocumentUrl', 'http://x.org/a.pdf', false], ['msdsDocumentUrl', 'javascript:alert(1)', false], ['msdsDocumentUrl', 'https://has space.pdf', false],
  ] as const)('%s %j → %s', (field, value, ok) => expect(validateDgField(field, value) === null).toBe(ok));
});

describe('evaluateDangerousGoods', () => {
  it('declares nothing and blocks nothing when no dangerous goods are flagged — even with empty fields', () => {
    expect(evaluateDangerousGoods({ isDangerousGoods: false }, [wagon('W1')])).toEqual({ required: false, ready: true, dgWagons: 0, missing: [], invalid: [], summary: 'No dangerous goods declared.' });
  });
  it('a complete dangerous-goods consignment is ready', () => {
    expect(evaluateDangerousGoods(con(), [wagon('W1'), wagon('W2')])).toMatchObject({ required: true, ready: true, missing: [], invalid: [] });
  });
  it('flagged with NOTHING filled in: all five fields are missing', () => {
    const r = evaluateDangerousGoods({ consignmentNumber: 'C1', isDangerousGoods: true });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([{ scope: 'CONSIGNMENT', ref: 'C1', fields: [...DG_MANDATORY_FIELDS] }]);
    expect(r.summary).toMatch(/consignment: missing UN number, IMDG class, Placard reference, 24-hour emergency contact, Safety data sheet \(MSDS\) link/);
  });
  it.each(DG_MANDATORY_FIELDS)('missing only %s is reported as exactly that field', (f) => {
    const r = evaluateDangerousGoods(con({ [f]: null }));
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([{ scope: 'CONSIGNMENT', ref: 'RAIL-2026-00001', fields: [f] }]);
  });
  it('treats whitespace-only values as missing', () => {
    expect(evaluateDangerousGoods(con({ placardRef: '   ' })).missing[0].fields).toEqual(['placardRef']);
  });
  it('a present-but-malformed value blocks too, with the reason', () => {
    const r = evaluateDangerousGoods(con({ unNumber: 'UN12', msdsDocumentUrl: 'http://insecure.example/x.pdf' }));
    expect(r.ready).toBe(false);
    expect(r.invalid.map((i) => `${i.field}`).sort()).toEqual(['msdsDocumentUrl', 'unNumber']);
    expect(r.summary).toMatch(/UN number must be UN followed by four digits/);
  });
  describe('wagon-level flags', () => {
    it('a flagged wagon with its own complete values is ready even if the consignment is not flagged', () => {
      expect(evaluateDangerousGoods({ isDangerousGoods: false }, [wagon('W1', { isDangerousGoods: true, ...COMPLETE }), wagon('W2')])).toMatchObject({ required: true, ready: true, dgWagons: 1 });
    });
    it('a flagged wagon inherits an empty field from the consignment', () => {
      const r = evaluateDangerousGoods(con({ isDangerousGoods: false }), [wagon('W1', { isDangerousGoods: true, unNumber: 'UN1830', imdgClass: '8', placardRef: 'PL-8' })]);
      expect(r.ready).toBe(true); // contact + MSDS come from the consignment
    });
    it('a wagon\'s own value overrides the consignment\'s', () => {
      const r = evaluateDangerousGoods(con(), [wagon('W1', { isDangerousGoods: true, unNumber: 'UN12' })]);
      expect(r.invalid).toEqual([expect.objectContaining({ scope: 'WAGON', ref: 'W1', field: 'unNumber' })]);
    });
    it('a flagged wagon with nothing anywhere names the wagon', () => {
      const r = evaluateDangerousGoods({ isDangerousGoods: false }, [wagon('SAR-064213', { isDangerousGoods: true })]);
      expect(r.ready).toBe(false);
      expect(r.missing).toEqual([{ scope: 'WAGON', ref: 'SAR-064213', fields: [...DG_MANDATORY_FIELDS] }]);
      expect(r.summary).toMatch(/wagon SAR-064213: missing UN number/);
    });
    it('every flagged wagon is checked, and unflagged wagons never block', () => {
      const r = evaluateDangerousGoods({ isDangerousGoods: false }, [
        wagon('GOOD', { isDangerousGoods: true, ...COMPLETE }), wagon('BAD', { isDangerousGoods: true, unNumber: 'UN1203' }), wagon('PLAIN'),
      ]);
      expect(r.dgWagons).toBe(2);
      expect(r.missing.map((m) => m.ref)).toEqual(['BAD']);
    });
    it('a flagged consignment needs its OWN fields complete even when its flagged wagons are complete', () => {
      const r = evaluateDangerousGoods({ consignmentNumber: 'C9', isDangerousGoods: true }, [wagon('W1', { isDangerousGoods: true, ...COMPLETE })]);
      expect(r.ready).toBe(false);
      expect(r.missing).toEqual([expect.objectContaining({ scope: 'CONSIGNMENT', ref: 'C9' })]);
    });
  });
});

describe('isMovementStatus', () => {
  it('the gate applies to a move INTO departed / in transit / at interchange only', () => {
    for (const s of ['DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE']) expect(isMovementStatus(s)).toBe(true);
    for (const s of ['PLANNED', 'WAGONS_ALLOCATED', 'LOADING', 'ARRIVED', 'OFFLOADED', 'COMPLETED', 'CANCELLED', 'NOPE']) expect(isMovementStatus(s)).toBe(false);
  });
});
