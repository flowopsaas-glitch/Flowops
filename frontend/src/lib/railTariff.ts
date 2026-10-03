import { formatMoney } from "./currency";
import type {
  AncillaryService, OverloadStatus, RailLimitSource, RailPriceStatus, SavedCalculation, TariffLine, TariffLineKind, TariffRequest, TariffStatus,
  WeighbridgeDraft, WeighbridgeReading,
} from "../api/railTariffApi";
import type { Tone } from "./railSlot";

/**
 * Wording, colour, form validation and request building for the tariff calculator and the weighbridge.
 *
 * NOTHING HERE PRICES ANYTHING OR JUDGES A WEIGHT. Every rate, every amount, every overload verdict and every hold is
 * worked out on the SERVER (backend rail-tariff.rules.ts) from stored data; this file only labels what came back and turns the
 * form into a request. The one rule it enforces on display is the one that matters most: a line with no rate is "Not priced",
 * never R0.00 — Annexure 40 says "TBD", and TBD is neither zero nor free.
 */

// ── money and numbers ────────────────────────────────────────────────────────

export const zar = (n: number): string => formatMoney(n, "ZAR");

/** The amount of a line as text. `null` ⇒ "Not priced" (the shared formatMoney would print a null as R0.00 — the trap this avoids). */
export function lineAmountText(line: Pick<TariffLine, "amountZar">): string {
  return typeof line.amountZar === "number" && Number.isFinite(line.amountZar) ? zar(line.amountZar) : "Not priced";
}

/** A quantity or rate with up to `max` decimals; "—" when there is none. */
export function fmtNum(n: number | null | undefined, max = 3): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-ZA", { maximumFractionDigits: max });
}

export const fmtQuantity = (l: Pick<TariffLine, "quantity" | "unit">): string => (l.quantity === null ? "—" : `${fmtNum(l.quantity)} ${l.unit}`);
export const fmtRate = (l: Pick<TariffLine, "rate" | "rateUnit">): string => (l.rate === null ? "no rate loaded" : `${fmtNum(l.rate, 4)} ${l.rateUnit ?? ""}`.trim());

export const unpricedLineCount = (lines: readonly Pick<TariffLine, "amountZar">[]): number => lines.filter((l) => typeof l.amountZar !== "number").length;

// ── labels and tones ─────────────────────────────────────────────────────────

export const TARIFF_STATUS_LABEL: Record<TariffStatus, string> = {
  PRICED: "Fully priced", INCOMPLETE: "Incomplete — some lines have no rate", BLOCKED: "Cannot be priced",
};
export const tariffStatusTone = (s: TariffStatus): Tone => ({ PRICED: "ok", INCOMPLETE: "warn", BLOCKED: "danger" } as const)[s];

export const LINE_KIND_LABEL: Record<TariffLineKind, string> = {
  GTK_LOADED: "Infrastructure — loaded", GTK_EMPTY: "Infrastructure — empty return", TRACTION_ENERGY: "Traction energy",
  ANCILLARY: "Ancillary service (Annexure 40)", OVERLOAD_PENALTY: "Overload penalty",
};

export const PRICE_STATUS_LABEL: Record<RailPriceStatus, string> = { NOT_PUBLISHED: "No price published", TBD: "TBD — not zero, not free", PUBLISHED: "Published" };
export const priceStatusTone = (s: RailPriceStatus): Tone => ({ NOT_PUBLISHED: "muted", TBD: "warn", PUBLISHED: "ok" } as const)[s];

export const OVERLOAD_LABEL: Record<OverloadStatus, string> = { WITHIN_LIMIT: "Within limit", OVERLOADED: "OVERLOADED", UNVERIFIED: "Unverified — not judged" };
export const overloadTone = (s: OverloadStatus): Tone => ({ WITHIN_LIMIT: "ok", OVERLOADED: "danger", UNVERIFIED: "warn" } as const)[s];

export const LIMIT_SOURCE_LABEL: Record<RailLimitSource, string> = {
  CORRIDOR: "verified corridor limit", MANUAL: "limit entered with the reading", NONE: "no limit known",
};

export const isOnHold = (c: { holdStatus?: string | null }): boolean => c.holdStatus === "HOLD_FOR_LOAD_ADJUSTMENT";

/** "26 t × 4 axles = 104 t (verified corridor limit)" — or why the reading could not be judged. */
export function describeLimit(r: Pick<WeighbridgeReading, "maxAxleLoadTonnes" | "axles" | "allowedTonnes" | "limitSource">): string {
  if (r.maxAxleLoadTonnes == null || r.axles == null || r.allowedTonnes == null) {
    return r.axles == null ? "axle count unknown — not judged" : "no limit known — not judged";
  }
  return `${fmtNum(r.maxAxleLoadTonnes)} t × ${r.axles} axle${r.axles === 1 ? "" : "s"} = ${fmtNum(r.allowedTonnes)} t (${LIMIT_SOURCE_LABEL[r.limitSource]})`;
}

/**
 * Which readings are each wagon's CURRENT one (the one the server's hold follows): the most recently RECORDED. Display only —
 * whether the consignment is held is read from the consignment, never worked out here.
 */
export function currentReadingIds(readings: readonly Pick<WeighbridgeReading, "id" | "wagonNumber" | "createdAt">[]): Set<string> {
  const best = new Map<string, { id: string; at: number; order: number }>();
  readings.forEach((r, order) => {
    const at = new Date(r.createdAt).getTime();
    const cur = best.get(r.wagonNumber);
    // ties go to the one listed first (the API lists newest first)
    if (!cur || at > cur.at) best.set(r.wagonNumber, { id: r.id, at, order });
  });
  return new Set([...best.values()].map((b) => b.id));
}

// ── invoice draft ────────────────────────────────────────────────────────────

/** The button is offered only for a fully priced calculation that has not been drafted yet, to someone who may write. */
export function canGenerateInvoiceDraft(c: Pick<SavedCalculation, "status" | "invoiceDraftId" | "lines">, canWrite: boolean): boolean {
  return canWrite && c.status === "PRICED" && !c.invoiceDraftId && unpricedLineCount(c.lines) === 0;
}

/** Why there is no button, in words (null when there is nothing to explain). */
export function invoiceDraftNote(c: Pick<SavedCalculation, "status" | "invoiceDraftId" | "invoiceDraftedAt" | "lines" | "blockers">): string | null {
  if (c.invoiceDraftId) return `Invoice draft created${c.invoiceDraftedAt ? ` ${new Date(c.invoiceDraftedAt).toISOString().slice(0, 10)}` : ""}.`;
  const n = unpricedLineCount(c.lines);
  if (c.status !== "PRICED" || n > 0) return `${n || c.blockers.length} line(s) have no rate, so no invoice draft can be made. Load the missing rates and calculate again.`;
  return null;
}

// ── the calculator form ──────────────────────────────────────────────────────

export interface TariffFormState {
  consignmentId: string; distanceKm: string; financialYear: string; includeEmptyReturn: boolean; allowEscalation: boolean;
  traction: "NONE" | "DIESEL" | "ELECTRIC"; litres: string; kWh: string; pricePerUnit: string;
  ancillary: { code: string; quantity: string }[];
}

export const emptyTariffForm = (): TariffFormState => ({
  consignmentId: "", distanceKm: "", financialYear: "", includeEmptyReturn: false, allowEscalation: false,
  traction: "NONE", litres: "", kWh: "", pricePerUnit: "", ancillary: [],
});

export type TariffFormErrors = Partial<Record<"consignmentId" | "distanceKm" | "financialYear" | "litres" | "kWh" | "pricePerUnit" | "ancillary", string>>;

/** A plain decimal ("12", "0.5"): no exponent, no thousands separator, no sign — so "1e9" or "Infinity" can never reach the server. */
const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const num = (s: string): number | undefined => (s.trim() === "" ? undefined : PLAIN_NUMBER.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const FY = /^\d{4}\/\d{2}$/;
export const ANCILLARY_CODE = /^ANX40-\d{2}(-\d{2})?$/;

function range(label: string, v: number | undefined, min: number, max: number, required = false): string | undefined {
  if (v === undefined) return required ? `${label} is required.` : undefined;
  if (Number.isNaN(v)) return `${label}: use digits and a decimal point only.`;
  if (v < min || v > max) return `${label} must be between ${min} and ${max}.`;
  return undefined;
}

/** Mirrors the server's DTO limits so the user is told before the round trip; the server validates again regardless. */
export function tariffFormErrors(f: TariffFormState): TariffFormErrors {
  const e: TariffFormErrors = {};
  if (!f.consignmentId) e.consignmentId = "Choose a consignment.";
  const d = range("Distance", num(f.distanceKm), 0.1, 10_000, true);
  if (d) e.distanceKm = d;
  if (f.financialYear.trim() && !FY.test(f.financialYear.trim())) e.financialYear = "Use the form 2026/27 (or leave blank to use the planned departure).";
  if (f.traction === "DIESEL") { const m = range("Litres", num(f.litres), 0.001, 10_000_000); if (m) e.litres = m; }
  if (f.traction === "ELECTRIC") { const m = range("kWh", num(f.kWh), 0.001, 1_000_000_000); if (m) e.kWh = m; }
  if (f.traction !== "NONE") { const m = range("Price", num(f.pricePerUnit), 0.0001, 100_000); if (m) e.pricePerUnit = m; }
  if (f.ancillary.length > 50) e.ancillary = "At most 50 ancillary services per calculation.";
  else {
    for (const a of f.ancillary) {
      const m = range(`Quantity for ${a.code}`, num(a.quantity), 0.001, 1_000_000, true);
      if (m) { e.ancillary = m; break; }
    }
  }
  return e;
}

/** The request to send. Call only when `tariffFormErrors` is empty. Blank optional fields are omitted, never sent as 0. */
export function buildTariffRequest(f: TariffFormState): TariffRequest {
  const req: TariffRequest = { consignmentId: f.consignmentId, distanceKm: num(f.distanceKm) as number };
  if (f.financialYear.trim()) req.financialYear = f.financialYear.trim();
  if (f.includeEmptyReturn) req.includeEmptyReturn = true;
  if (f.allowEscalation) req.allowEscalation = true;
  if (f.traction !== "NONE") {
    const price = num(f.pricePerUnit);
    req.traction = f.traction === "DIESEL"
      ? { type: "DIESEL", ...(num(f.litres) !== undefined ? { litres: num(f.litres) as number } : {}), ...(price !== undefined ? { pricePerUnitZar: price } : {}) }
      : { type: "ELECTRIC", ...(num(f.kWh) !== undefined ? { kWh: num(f.kWh) as number } : {}), ...(price !== undefined ? { pricePerUnitZar: price } : {}) };
  }
  if (f.ancillary.length) req.ancillary = f.ancillary.map((a) => ({ code: a.code, quantity: num(a.quantity) as number }));
  return req;
}

/** Identifies the inputs a preview was worked out for — a changed key means the result on screen is stale. */
export const tariffFormKey = (f: TariffFormState): string => JSON.stringify(f);

// ── Annexure 40 picker ───────────────────────────────────────────────────────

export interface AncillaryGroupView { serviceNumber: number; serviceName: string; tierName: string; lines: AncillaryService[] }

/** The 113 lines grouped under their 40 services, filtered by a free-text query over code, names and section. */
export function groupAncillary(services: readonly AncillaryService[], query = ""): AncillaryGroupView[] {
  const q = query.trim().toLowerCase();
  const hit = (s: AncillaryService) => !q || [s.code, s.name, s.serviceName, s.section ?? "", s.tierName].some((t) => t.toLowerCase().includes(q));
  const groups = new Map<number, AncillaryGroupView>();
  for (const s of services.filter(hit)) {
    const g = groups.get(s.serviceNumber) ?? { serviceNumber: s.serviceNumber, serviceName: s.serviceName, tierName: s.tierName, lines: [] };
    g.lines.push(s);
    groups.set(s.serviceNumber, g);
  }
  return [...groups.values()].sort((a, b) => a.serviceNumber - b.serviceNumber).map((g) => ({ ...g, lines: [...g.lines].sort((a, b) => a.code.localeCompare(b.code)) }));
}

// ── weighbridge form ─────────────────────────────────────────────────────────

export interface WeighbridgeFormState { wagonNumber: string; actualTonnes: string; axles: string; maxAxleLoadTonnes: string; weighbridge: string; note: string }

export const emptyWeighbridgeForm = (): WeighbridgeFormState => ({ wagonNumber: "", actualTonnes: "", axles: "", maxAxleLoadTonnes: "", weighbridge: "", note: "" });

export type WeighbridgeFormErrors = Partial<Record<keyof WeighbridgeFormState, string>>;

export function weighbridgeFormErrors(f: WeighbridgeFormState): WeighbridgeFormErrors {
  const e: WeighbridgeFormErrors = {};
  if (!f.wagonNumber) e.wagonNumber = "Choose a wagon.";
  const t = range("Gross mass", num(f.actualTonnes), 0.001, 1000, true);
  if (t) e.actualTonnes = t;
  if (f.axles.trim()) {
    const a = num(f.axles);
    if (a === undefined || Number.isNaN(a) || !Number.isInteger(a) || a < 1 || a > 12) e.axles = "Axles must be a whole number from 1 to 12.";
  }
  if (f.maxAxleLoadTonnes.trim()) { const m = range("Maximum axle load", num(f.maxAxleLoadTonnes), 0.1, 60); if (m) e.maxAxleLoadTonnes = m; }
  if (f.weighbridge.length > 120) e.weighbridge = "At most 120 characters.";
  if (f.note.length > 1000) e.note = "At most 1000 characters.";
  return e;
}

/** Blank optional fields are omitted. The mass is the only number the user has to know; the verdict is the server's. */
export function buildWeighbridgeDraft(consignmentId: string, f: WeighbridgeFormState): WeighbridgeDraft {
  const d: WeighbridgeDraft = { consignmentId, wagonNumber: f.wagonNumber, actualTonnes: num(f.actualTonnes) as number };
  if (f.axles.trim()) d.axles = num(f.axles) as number;
  if (f.maxAxleLoadTonnes.trim()) d.maxAxleLoadTonnes = num(f.maxAxleLoadTonnes) as number;
  if (f.weighbridge.trim()) d.weighbridge = f.weighbridge.trim();
  if (f.note.trim()) d.note = f.note.trim();
  return d;
}
