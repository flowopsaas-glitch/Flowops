import { describe, it, expect } from 'vitest';
import {
  availableActions, describeDaysLeft, docTone, envelopeLabel, envelopeTone, hasMobilisationClock, mobilisationTone,
  rsrBlocksSubmission, rsrTone, slotStatusTone,
} from './railSlot';

describe('mobilisation badge', () => {
  it('turns amber when due soon and red once overdue or flagged — an unoperated slot never looks fine', () => {
    expect(mobilisationTone('ON_TRACK')).toBe('ok');
    expect(mobilisationTone('DUE_SOON')).toBe('warn');
    expect(mobilisationTone('OVERDUE')).toBe('danger');
    expect(mobilisationTone('FORFEITURE_FLAGGED')).toBe('danger');
    expect(mobilisationTone('OPERATED')).toBe('info');
  });
  it('only an allocated slot has a clock to show', () => {
    for (const s of ['ON_TRACK', 'DUE_SOON', 'OVERDUE', 'FORFEITURE_FLAGGED', 'OPERATED'] as const) expect(hasMobilisationClock(s)).toBe(true);
    for (const s of ['NOT_ALLOCATED', 'CLOSED'] as const) expect(hasMobilisationClock(s)).toBe(false);
  });
});

describe('RSR permit guard', () => {
  it.each([['OK', 'ok'], ['WARNING', 'warn'], ['CRITICAL', 'danger'], ['EXPIRED', 'danger'], ['MISSING', 'danger'], ['PENDING_REVIEW', 'info']] as const)(
    '%s → %s', (level, tone) => expect(rsrTone(level)).toBe(tone));
  it('blocks submission when the permit is expired, missing or unverified — but not merely expiring', () => {
    for (const l of ['EXPIRED', 'MISSING', 'PENDING_REVIEW'] as const) expect(rsrBlocksSubmission(l)).toBe(true);
    for (const l of ['OK', 'WARNING', 'CRITICAL'] as const) expect(rsrBlocksSubmission(l)).toBe(false);
  });
});

describe('document + envelope tones', () => {
  it('only VALID is green', () => {
    expect(docTone('VALID')).toBe('ok');
    for (const s of ['EXPIRED', 'REVOKED'] as const) expect(docTone(s)).toBe('danger');
    expect(docTone('PENDING_REVIEW')).toBe('info');
    expect(docTone('NOT_YET_VALID')).toBe('warn');
  });
  it('UNVERIFIED is amber and says the fit is not confirmed — it is never shown as compatible', () => {
    expect(envelopeTone('UNVERIFIED')).toBe('warn');
    expect(envelopeLabel('UNVERIFIED')).toMatch(/fit not confirmed/);
    expect(envelopeTone('COMPATIBLE')).toBe('ok');
    expect(envelopeTone('INCOMPATIBLE')).toBe('danger');
    expect(envelopeLabel('INCOMPATIBLE')).toMatch(/rejected/);
  });
});

describe('describeDaysLeft', () => {
  it.each([[null, '—'], [undefined, '—'], [0, 'expires today'], [1, '1 day left'], [30, '30 days left'], [-1, 'expired 1 day ago'], [-12, 'expired 12 days ago']])(
    '%s → %s', (n, text) => expect(describeDaysLeft(n as number | null | undefined)).toBe(text));
});

describe('slotStatusTone', () => {
  it('covers every status', () => {
    for (const s of ['DRAFT', 'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT', 'ALLOCATED', 'REJECTED', 'EXPIRED'] as const) expect(slotStatusTone(s)).toBeTruthy();
    expect(slotStatusTone('ALLOCATED')).toBe('ok');
  });
});

describe('availableActions', () => {
  const full = { canWrite: true, canSign: true, operated: false };
  it('a read-only user gets no actions at all', () => {
    for (const s of ['DRAFT', 'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT', 'ALLOCATED'] as const) {
      expect(availableActions(s, { canWrite: false, canSign: false, operated: false })).toEqual([]);
    }
  });
  it('only a signatory sees Submit', () => {
    expect(availableActions('DRAFT', full)).toEqual(['submit']);
    expect(availableActions('DRAFT', { ...full, canSign: false })).toEqual([]);
  });
  it('offers exactly the moves the state machine allows', () => {
    expect(availableActions('SUBMITTED', full)).toEqual(['assess', 'reject']);
    expect(availableActions('UNDER_ASSESSMENT', full)).toEqual(['conflict', 'allocate', 'reject']);
    expect(availableActions('CAPACITY_CONFLICT', full)).toEqual(['resolve-conflict', 'allocate', 'reject']);
    expect(availableActions('ALLOCATED', full)).toEqual(['operated', 'link', 'expire']);
    expect(availableActions('REJECTED', full)).toEqual([]);
    expect(availableActions('EXPIRED', full)).toEqual([]);
  });
  it('an already-operated slot cannot be "operated" again', () => {
    expect(availableActions('ALLOCATED', { ...full, operated: true })).toEqual(['link', 'expire']);
  });
});
