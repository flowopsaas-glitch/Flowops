import type { RailSlotApplicationStatus } from '@prisma/client';
import { MAX_SLOT_VALIDITY_YEARS, MOBILISATION_DAYS, MOBILISATION_DUE_SOON_DAYS } from './rail-reference';

/**
 * Slot-application rules — pure, so the clock and the state machine can be tested exhaustively.
 *
 * The brief lists the states DRAFT → SUBMITTED → UNDER_ASSESSMENT → CAPACITY_CONFLICT →
 * ALLOCATED → REJECTED → EXPIRED. The allowed transitions below are FlowOps's reading of that
 * list (the supplied material does not define them): the IM decides, the TOC records.
 */

export const SLOT_TRANSITIONS: Record<RailSlotApplicationStatus, RailSlotApplicationStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_ASSESSMENT', 'REJECTED'],
  UNDER_ASSESSMENT: ['CAPACITY_CONFLICT', 'ALLOCATED', 'REJECTED'],
  CAPACITY_CONFLICT: ['UNDER_ASSESSMENT', 'ALLOCATED', 'REJECTED'],
  ALLOCATED: ['EXPIRED'],
  REJECTED: [],
  EXPIRED: [],
};

export const canTransition = (from: RailSlotApplicationStatus, to: RailSlotApplicationStatus): boolean =>
  SLOT_TRANSITIONS[from].includes(to);

const DAY = 86_400_000;

/** `date` shifted by whole calendar years in UTC (29 Feb rolls to 1 Mar in a non-leap year). */
export function addUtcYears(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  if (day > lastDay) { d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(1); } else d.setUTCDate(day);
  return d;
}

export interface WindowCheck { ok: boolean; reason?: string }

/** A validity window must run forwards and last at most MAX_SLOT_VALIDITY_YEARS (inclusive of the 5th anniversary). */
export function checkValidityWindow(from: Date, until: Date): WindowCheck {
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) return { ok: false, reason: 'The validity window has an invalid date.' };
  if (until.getTime() <= from.getTime()) return { ok: false, reason: 'The validity window must end after it starts.' };
  if (until.getTime() > addUtcYears(from, MAX_SLOT_VALIDITY_YEARS).getTime()) {
    return { ok: false, reason: `A slot validity window may not exceed ${MAX_SLOT_VALIDITY_YEARS} years.` };
  }
  return { ok: true };
}

/** allocatedAt + MOBILISATION_DAYS, in exact 24-hour days (so it is stable across DST). */
export function computeMobilizeBy(allocatedAt: Date, days: number = MOBILISATION_DAYS): Date {
  return new Date(allocatedAt.getTime() + days * DAY);
}

export type MobilisationState =
  | 'NOT_ALLOCATED' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'FORFEITURE_FLAGGED' | 'OPERATED' | 'CLOSED';

export interface MobilisationView {
  state: MobilisationState;
  mobilizeBy: string | null;
  /** Whole days left (ceil). 0 = due today, negative = days overdue. null when there is no clock. */
  daysRemaining: number | null;
  label: string;
}

export interface SlotClockFields {
  status: RailSlotApplicationStatus;
  allocatedAt?: Date | string | null;
  mobilizeBy?: Date | string | null;
  firstOperatedAt?: Date | string | null;
  forfeitureFlaggedAt?: Date | string | null;
}

export function mobilisationView(app: SlotClockFields, now: Date = new Date()): MobilisationView {
  if (app.status === 'EXPIRED' || app.status === 'REJECTED') return { state: 'CLOSED', mobilizeBy: null, daysRemaining: null, label: app.status === 'EXPIRED' ? 'Expired' : 'Rejected' };
  if (app.status !== 'ALLOCATED' || !app.mobilizeBy) return { state: 'NOT_ALLOCATED', mobilizeBy: null, daysRemaining: null, label: 'Not allocated' };
  const due = new Date(app.mobilizeBy);
  const mobilizeBy = due.toISOString();
  const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / DAY);
  if (app.firstOperatedAt) return { state: 'OPERATED', mobilizeBy, daysRemaining, label: 'Operating' };
  if (app.forfeitureFlaggedAt) return { state: 'FORFEITURE_FLAGGED', mobilizeBy, daysRemaining, label: 'Forfeiture flagged — unoperated' };
  if (now.getTime() > due.getTime()) return { state: 'OVERDUE', mobilizeBy, daysRemaining, label: `Overdue by ${Math.abs(daysRemaining)} day(s)` };
  if (daysRemaining <= MOBILISATION_DUE_SOON_DAYS) return { state: 'DUE_SOON', mobilizeBy, daysRemaining, label: daysRemaining <= 0 ? 'Mobilise today' : `${daysRemaining} day(s) to mobilise` };
  return { state: 'ON_TRACK', mobilizeBy, daysRemaining, label: `${daysRemaining} day(s) to mobilise` };
}

/** True when an ALLOCATED, never-operated application is past mobilizeBy and not yet flagged. */
export function isForfeitureDue(app: SlotClockFields, now: Date = new Date()): boolean {
  return app.status === 'ALLOCATED' && !!app.mobilizeBy && !app.firstOperatedAt && !app.forfeitureFlaggedAt
    && now.getTime() > new Date(app.mobilizeBy).getTime();
}

/** True when an ALLOCATED application's validity window has ended. */
export function isValidityEnded(app: { status: RailSlotApplicationStatus; validUntil?: Date | string | null }, now: Date = new Date()): boolean {
  return app.status === 'ALLOCATED' && !!app.validUntil && now.getTime() > new Date(app.validUntil).getTime();
}
