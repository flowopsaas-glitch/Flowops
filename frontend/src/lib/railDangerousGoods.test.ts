import { describe, it, expect } from 'vitest';
import {
  DG_FIELDS, dgBadge, dgFormFrom, dgFormToPayload, normaliseUnNumber, validateDgField, validateDgForm, wagonDgLabel,
} from './railDangerousGoods';

describe('normaliseUnNumber', () => {
  it.each([['1203', 'UN1203'], ['un1203', 'UN1203'], ['UN 1203', 'UN1203'], ['  un  1203 ', 'UN1203'], ['UN1203', 'UN1203']])('"%s" → %s', (raw, out) => {
    expect(normaliseUnNumber(raw)).toBe(out);
  });
  it('leaves something that is not a UN number for the validator to reject', () => {
    expect(normaliseUnNumber('abc')).toBe('ABC');
    expect(normaliseUnNumber('123')).toBe('123');
  });
});

describe('validateDgField (mirrors the backend patterns; the server stays authoritative)', () => {
  it('blank is not an error — a field may be left empty while the form is being completed', () => {
    for (const f of DG_FIELDS) expect(validateDgField(f.key, '   ')).toBeNull();
  });
  it.each([['unNumber', 'UN1203'], ['unNumber', '1203'], ['unNumber', 'un 1267'], ['imdgClass', '3'], ['imdgClass', '2.1'], ['imdgClass', '6.1'], ['imdgClass', '1.4S'], ['imdgClass', '1.4s'],
    ['placardRef', 'Placard 3'], ['emergencyContact24h', '+27 11 555 0100'], ['emergencyContact24h', '(011) 555-0100'], ['msdsDocumentUrl', 'https://example.org/msds.pdf']] as const)(
    'accepts %s = "%s"', (field, value) => expect(validateDgField(field, value)).toBeNull());
  it.each([['unNumber', 'UN123'], ['unNumber', 'UN12345'], ['unNumber', 'UNABCD'], ['imdgClass', '0'], ['imdgClass', '10'], ['imdgClass', '2.7'], ['imdgClass', 'flammable'],
    ['placardRef', 'x'.repeat(61)], ['emergencyContact24h', 'call Dave'], ['emergencyContact24h', '12345'], ['msdsDocumentUrl', 'http://example.org/m.pdf'],
    ['msdsDocumentUrl', 'javascript:alert(1)'], ['msdsDocumentUrl', 'https://example.org/a b'], ['msdsDocumentUrl', `https://e.org/${'x'.repeat(500)}`]] as const)(
    'rejects %s = "%s" with a readable message', (field, value) => expect(validateDgField(field, value)).toMatch(/\S/));
  it('validateDgForm reports only the fields that are present and malformed', () => {
    const f = dgFormFrom({ isDangerousGoods: true, unNumber: 'bad', imdgClass: '3', msdsDocumentUrl: 'http://x' });
    expect(Object.keys(validateDgForm(f)).sort()).toEqual(['msdsDocumentUrl', 'unNumber']);
  });
});

describe('dgFormFrom / dgFormToPayload', () => {
  it('prefills from the saved consignment, with empty strings for missing values', () => {
    expect(dgFormFrom(undefined)).toEqual({ isDangerousGoods: false, unNumber: '', imdgClass: '', placardRef: '', emergencyContact24h: '', msdsDocumentUrl: '' });
    expect(dgFormFrom({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: null })).toMatchObject({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '' });
  });
  it('sends a blank field as null — NEVER "" (the API rejects an empty string for a pattern-checked field)', () => {
    const p = dgFormToPayload({ ...dgFormFrom(null), isDangerousGoods: true, placardRef: '   ' });
    expect(p).toEqual({ isDangerousGoods: true, unNumber: null, imdgClass: null, placardRef: null, emergencyContact24h: null, msdsDocumentUrl: null });
    expect(Object.values(p)).not.toContain('');
  });
  it('trims, upper-cases the class and sends the UN number normalised', () => {
    const p = dgFormToPayload({
      isDangerousGoods: true, unNumber: ' un 1203 ', imdgClass: ' 1.4s ', placardRef: '  Placard 3 ', emergencyContact24h: ' +27 11 555 0100 ', msdsDocumentUrl: ' https://example.org/m.pdf ',
    });
    expect(p).toEqual({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '1.4S', placardRef: 'Placard 3', emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: 'https://example.org/m.pdf' });
  });
  it('can switch the flag off while keeping the saved details', () => {
    expect(dgFormToPayload({ ...dgFormFrom({ isDangerousGoods: true, unNumber: 'UN1203' }), isDangerousGoods: false })).toMatchObject({ isDangerousGoods: false, unNumber: 'UN1203' });
  });
});

describe('dgBadge', () => {
  it('shows nothing when there are no dangerous goods (or the server did not say)', () => {
    expect(dgBadge(undefined).show).toBe(false);
    expect(dgBadge(null).show).toBe(false);
    expect(dgBadge({ required: false, ready: true, problems: 0 }).show).toBe(false);
  });
  it('is green when ready', () => {
    expect(dgBadge({ required: true, ready: true, problems: 0 })).toMatchObject({ show: true, tone: 'ok', label: 'DG ready' });
  });
  it('is red with the number of gaps otherwise, and says departure is blocked', () => {
    expect(dgBadge({ required: true, ready: false, problems: 1 })).toMatchObject({ tone: 'danger', label: 'DG · 1 gap' });
    expect(dgBadge({ required: true, ready: false, problems: 5 })).toMatchObject({ tone: 'danger', label: 'DG · 5 gaps' });
    expect(dgBadge({ required: true, ready: false, problems: 5 }).title).toMatch(/blocked/);
    expect(dgBadge({ required: true, ready: false, problems: 0 }).label).toBe('DG · incomplete');
  });
});

describe('wagonDgLabel', () => {
  it('is null for a wagon that carries no dangerous goods', () => {
    expect(wagonDgLabel({ isDangerousGoods: false, unNumber: 'UN1203' })).toBeNull();
    expect(wagonDgLabel(undefined)).toBeNull();
  });
  it('shows UN number and class, or says the details are missing', () => {
    expect(wagonDgLabel({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3' })).toBe('UN1203 · class 3');
    expect(wagonDgLabel({ isDangerousGoods: true, unNumber: 'UN1203' })).toBe('UN1203');
    expect(wagonDgLabel({ isDangerousGoods: true })).toBe('DG — details missing');
  });
});
