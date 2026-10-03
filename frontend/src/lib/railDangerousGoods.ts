import type { DangerousGoodsFields } from "../api/railApi";
import type { DgField, DgSummary } from "../api/railChangeApi";
import type { Tone } from "./railSlot";

/**
 * Dangerous-goods form helpers (RAIL-011). Pure, so they are unit-tested.
 *
 * The format checks below mirror backend/src/rail/rail-dangerous-goods.ts so the user gets a readable message
 * BEFORE the request — the API client reduces a 400 validation failure to "Validation failed". They are a
 * courtesy only: the server re-validates, and whether a consignment may DEPART is decided by the server's gate
 * (GET /rail/consignments/:id/dangerous-goods), never by this file.
 */

export const DG_FIELDS: ReadonlyArray<{ key: DgField; label: string; placeholder: string }> = [
  { key: "unNumber", label: "UN number", placeholder: "UN1203" },
  { key: "imdgClass", label: "IMDG class", placeholder: "3, 2.1, 6.1, 1.4S" },
  { key: "placardRef", label: "Placard reference", placeholder: "e.g. Placard 3 — flammable liquid" },
  { key: "emergencyContact24h", label: "24-hour emergency contact", placeholder: "+27 11 555 0100" },
  { key: "msdsDocumentUrl", label: "Safety data sheet (MSDS) link", placeholder: "https://…" },
];

export const DG_FIELD_LABEL = Object.fromEntries(DG_FIELDS.map((f) => [f.key, f.label])) as Record<DgField, string>;

/** "1203", "un1203", "UN 1203" → "UN1203". Anything else is returned trimmed and upper-cased for the validator to reject. */
export function normaliseUnNumber(v: string): string {
  const t = v.trim().toUpperCase().replace(/\s+/g, "");
  return /^\d{4}$/.test(t) ? `UN${t}` : t;
}

/** An error message for a present-but-malformed value, or null when it is fine (blank is not an error here). */
export function validateDgField(field: DgField, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  switch (field) {
    case "unNumber": return /^UN\d{4}$/.test(normaliseUnNumber(v)) ? null : "Must be UN followed by four digits (e.g. UN1203).";
    case "imdgClass": return /^[1-9](\.[1-6])?[A-Za-z]?$/.test(v) ? null : "Must be an IMDG class such as 3, 2.1, 6.1 or 1.4S.";
    case "placardRef": return v.length <= 60 ? null : "At most 60 characters.";
    case "emergencyContact24h": return /^\+?\(?[0-9][0-9 ()-]{5,18}[0-9]$/.test(v) ? null : "Must be a phone number.";
    case "msdsDocumentUrl": return /^https:\/\/\S+$/.test(v) && v.length <= 500 ? null : "Must be an https:// link.";
    default: return null;
  }
}

export interface DgFormState {
  isDangerousGoods: boolean;
  unNumber: string; imdgClass: string; placardRef: string; emergencyContact24h: string; msdsDocumentUrl: string;
}

export const dgFormFrom = (c: DangerousGoodsFields | null | undefined): DgFormState => ({
  isDangerousGoods: !!c?.isDangerousGoods,
  unNumber: c?.unNumber ?? "", imdgClass: c?.imdgClass ?? "", placardRef: c?.placardRef ?? "",
  emergencyContact24h: c?.emergencyContact24h ?? "", msdsDocumentUrl: c?.msdsDocumentUrl ?? "",
});

/** Errors only for values that are present but malformed — leaving a field blank is allowed (the gate blocks dispatch until complete). */
export function validateDgForm(form: DgFormState): Partial<Record<DgField, string>> {
  const errors: Partial<Record<DgField, string>> = {};
  for (const f of DG_FIELDS) {
    const msg = validateDgField(f.key, form[f.key]);
    if (msg) errors[f.key] = msg;
  }
  return errors;
}

/**
 * The PATCH body. A blank field is sent as null, NEVER as "": the API rejects an empty string for a
 * pattern-checked field, so null is the one way to clear a value. The UN number is sent normalised.
 */
export function dgFormToPayload(form: DgFormState): Required<Pick<DangerousGoodsFields, "isDangerousGoods">> & Record<DgField, string | null> {
  const clean = (v: string) => v.trim() || null;
  return {
    isDangerousGoods: form.isDangerousGoods,
    unNumber: form.unNumber.trim() ? normaliseUnNumber(form.unNumber) : null,
    imdgClass: form.imdgClass.trim() ? form.imdgClass.trim().toUpperCase() : null,
    placardRef: clean(form.placardRef),
    emergencyContact24h: clean(form.emergencyContact24h),
    msdsDocumentUrl: clean(form.msdsDocumentUrl),
  };
}

export interface DgBadgeView { show: boolean; tone: Tone; label: string; title: string }

/** The list badge. Nothing is shown for a consignment that carries no dangerous goods. */
export function dgBadge(dg: DgSummary | null | undefined): DgBadgeView {
  if (!dg || !dg.required) return { show: false, tone: "muted", label: "", title: "" };
  if (dg.ready) return { show: true, tone: "ok", label: "DG ready", title: "Dangerous goods — all mandatory details are complete" };
  const n = dg.problems;
  return {
    show: true, tone: "danger", label: n > 0 ? `DG · ${n} gap${n === 1 ? "" : "s"}` : "DG · incomplete",
    title: "Dangerous goods — departure is blocked until the mandatory details are complete",
  };
}

/** "UN1203 · class 3" for a wagon that carries dangerous goods; null otherwise. */
export function wagonDgLabel(w: DangerousGoodsFields | null | undefined): string | null {
  if (!w?.isDangerousGoods) return null;
  const parts = [w.unNumber, w.imdgClass ? `class ${w.imdgClass}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "DG — details missing";
}
