/**
 * Dangerous-goods dispatch gate — pure.
 *
 * Evidence: the brief names the five mandatory fields (UN number, IMDG class, placard reference, 24-hour
 * emergency contact, MSDS link) and the rule "block dispatch if isDangerousGoods and fields are missing";
 * register R-005.4 lists the evidence a dangerous-goods application carries (safety data sheet, …).
 * The FORMATS below follow the UN / IMDG conventions — they are not taken from a supplied annexure.
 *
 * A wagon may be flagged individually; an empty field on a flagged wagon inherits the consignment's value.
 */

export const DG_MANDATORY_FIELDS = ['unNumber', 'imdgClass', 'placardRef', 'emergencyContact24h', 'msdsDocumentUrl'] as const;
export type DgField = (typeof DG_MANDATORY_FIELDS)[number];

export const DG_FIELD_LABEL: Record<DgField, string> = {
  unNumber: 'UN number', imdgClass: 'IMDG class', placardRef: 'Placard reference',
  emergencyContact24h: '24-hour emergency contact', msdsDocumentUrl: 'Safety data sheet (MSDS) link',
};

export type DgValues = Partial<Record<DgField, string | null>>;
export interface DgCarrier extends DgValues { isDangerousGoods?: boolean | null }

const blank = (v: unknown): boolean => v == null || String(v).trim() === '';

/** "1203", "un1203", "UN 1203" → "UN1203". Anything else is returned trimmed and upper-cased for the validator to reject. */
export function normaliseUnNumber(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  return /^\d{4}$/.test(t) ? `UN${t}` : t;
}

/** An error message for a present-but-malformed value, or null when it is fine. */
export function validateDgField(field: DgField, value: string): string | null {
  const v = value.trim();
  switch (field) {
    case 'unNumber': return /^UN\d{4}$/.test(v) ? null : 'must be UN followed by four digits (e.g. UN1203)';
    case 'imdgClass': return /^[1-9](\.[1-6])?[A-Z]?$/.test(v) ? null : 'must be an IMDG class such as 3, 2.1, 6.1 or 1.4S';
    case 'placardRef': return v.length <= 60 ? null : 'must be at most 60 characters';
    case 'emergencyContact24h': return /^\+?\(?[0-9][0-9 ()-]{5,18}[0-9]$/.test(v) ? null : 'must be a phone number';
    case 'msdsDocumentUrl': return /^https:\/\/\S+$/.test(v) ? null : 'must be an https:// link';
    default: return null;
  }
}

export interface DgGap { scope: 'CONSIGNMENT' | 'WAGON'; ref: string; fields: DgField[] }
export interface DgIssue { scope: 'CONSIGNMENT' | 'WAGON'; ref: string; field: DgField; reason: string }
export interface DgEvaluation {
  /** Any dangerous goods declared (consignment or wagon). */
  required: boolean;
  /** True ⇒ departure is not blocked on dangerous-goods grounds. */
  ready: boolean;
  dgWagons: number;
  missing: DgGap[];
  invalid: DgIssue[];
  summary: string;
}

function check(scope: 'CONSIGNMENT' | 'WAGON', ref: string, values: DgValues, gaps: DgGap[], issues: DgIssue[]) {
  const absent: DgField[] = [];
  for (const f of DG_MANDATORY_FIELDS) {
    const raw = values[f];
    if (blank(raw)) { absent.push(f); continue; }
    const bad = validateDgField(f, String(raw));
    if (bad) issues.push({ scope, ref, field: f, reason: `${DG_FIELD_LABEL[f]} ${bad}` });
  }
  if (absent.length) gaps.push({ scope, ref, fields: absent });
}

/**
 * `consignment.isDangerousGoods` ⇒ the consignment's own fields must be complete. Each wagon flagged
 * individually must be complete by its OWN values or, where empty, the consignment's.
 */
export function evaluateDangerousGoods(
  consignment: DgCarrier & { consignmentNumber?: string },
  wagons: ReadonlyArray<DgCarrier & { wagonNumber: string }> = [],
): DgEvaluation {
  const dgWagons = wagons.filter((w) => w.isDangerousGoods);
  const required = !!consignment.isDangerousGoods || dgWagons.length > 0;
  if (!required) return { required: false, ready: true, dgWagons: 0, missing: [], invalid: [], summary: 'No dangerous goods declared.' };

  const missing: DgGap[] = [];
  const invalid: DgIssue[] = [];
  if (consignment.isDangerousGoods) check('CONSIGNMENT', consignment.consignmentNumber ?? 'consignment', consignment, missing, invalid);
  for (const w of dgWagons) {
    const merged: DgValues = {};
    for (const f of DG_MANDATORY_FIELDS) merged[f] = blank(w[f]) ? consignment[f] ?? null : w[f];
    check('WAGON', w.wagonNumber, merged, missing, invalid);
  }
  const ready = missing.length === 0 && invalid.length === 0;
  const parts = [
    ...missing.map((g) => `${g.scope === 'CONSIGNMENT' ? 'consignment' : `wagon ${g.ref}`}: missing ${g.fields.map((f) => DG_FIELD_LABEL[f]).join(', ')}`),
    ...invalid.map((i) => `${i.scope === 'CONSIGNMENT' ? 'consignment' : `wagon ${i.ref}`}: ${i.reason}`),
  ];
  return { required: true, ready, dgWagons: dgWagons.length, missing, invalid, summary: ready ? 'Dangerous-goods details complete.' : parts.join('; ') };
}

/** Statuses that mean the cargo is moving — the gate applies to a move INTO any of them. */
export const MOVEMENT_STATUSES = ['DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE'] as const;
export const isMovementStatus = (s: string): boolean => (MOVEMENT_STATUSES as readonly string[]).includes(s);
