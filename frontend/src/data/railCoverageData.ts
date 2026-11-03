/**
 * Rail source coverage — the gap analysis behind `/rail/coverage`.
 *
 * WHY THIS EXISTS
 * `railStatementData.annexureRegister` records *whether* each of the 49 Network Statement V4
 * annexures has been delivered. That answers "do we have it?" but not "what can't we build
 * without it?", which is the question that actually drives the work. This module adds that
 * second axis: a capability domain, a criticality, and a concrete statement of what is unblocked
 * (for delivered sources) or blocked (for outstanding ones).
 *
 * SINGLE SOURCE OF TRUTH
 * Titles, chapters and have/have-not come from `annexureRegister` at runtime — this file only
 * carries the metadata keyed by annexure id. If an annexure is delivered later, flipping
 * `have: true` in `railStatementData.ts` moves it here automatically. There is no second list to
 * keep in sync, and `railCoverageData.test.ts` asserts that every id in the register has a
 * coverage row and vice versa.
 *
 * HONESTY RULES applied below
 *  - "blocker" is reserved for a source without which an operating workflow cannot be modelled
 *    correctly. It is not used for convenience.
 *  - An outstanding source is never described as though its content were known. The `effect` text
 *    says what is unavailable, not what the missing document probably says.
 *  - Delivered-but-caveated sources keep their caveat (29b is V3-era; 15 is an unexecuted form;
 *    18 is a pre-IM excerpt). Delivered does not mean authoritative.
 */

import { annexureRegister } from "./railStatementData";

export type CoverageCapability =
  | "Network reference"
  | "Capacity & allocation"
  | "Access & contracting"
  | "Train operations"
  | "Safety & occurrences"
  | "Commercial";

export type Criticality = "blocker" | "important" | "reference";

export interface CoverageMeta {
  /** Which part of the product this source feeds. */
  capability: CoverageCapability;
  /** Where the delivered content is surfaced, if it is surfaced. */
  route?: string;
  /**
   * blocker   — an operating workflow cannot be modelled correctly without this.
   * important — a complete operational picture needs it; work can proceed with the gap visible.
   * reference — contextual or specification detail, no workflow depends on it.
   */
  criticality: Criticality;
  /** Delivered: what it unblocks. Outstanding: what stays blocked, stated concretely. */
  effect: string;
}

/** Metadata for each of the 49 annexures, keyed by the register's own id. */
export const coverageMeta: Record<string, CoverageMeta> = {
  // ── Chapter 1 ────────────────────────────────────────────────────────────────
  "44": {
    capability: "Network reference",
    criticality: "reference",
    effect: "Unavailable. Without the table of changes we cannot show readers which V4 clauses moved from V3 — relevant only to someone auditing the rulebook itself.",
  },

  // ── Chapter 2 — network reference data ───────────────────────────────────────
  "1": {
    capability: "Train operations",
    route: "/rail/timetable",
    criticality: "important",
    effect: "Delivered as the 2024/25 REVISED schedule, not the 2026/27 provisional one (E-ANX1-01 period caveat). Usable for shutdown-window planning, but cannot drive a 2026/27 possession calendar.",
  },
  "2": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Track structure clearances decide which rolling stock can physically run a section. Without it, any load/vehicle compatibility check is guesswork.",
  },
  "3": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Vehicle gauges set the maximum profile on a route; needed before a consignment can be checked against the network.",
  },
  "4": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Crossing loop lines decide where trains can pass — the basis of any path-conflict or meeting-point calculation.",
  },
  "5": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Line gradients per section drive tractive-effort and load-limit calculations. Annexure 33b gives path counts but no gradient.",
  },
  "6": {
    capability: "Network reference",
    criticality: "blocker",
    effect: "Unavailable. This is the N1/N2 line-classification file. It is the same artefact the Annexure 33 register names as its appended data file (§1 and §3), so a single missing file blocks both the capacity register's line-class dimension and the statement's chapter-2 classification layer.",
  },
  "7": {
    capability: "Train operations",
    criticality: "reference",
    effect: "Unavailable. A radio coverage map is operational context for a driver; no workflow in this product depends on it.",
  },
  "8": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Tunnel restrictions set clearance limits on the routes they affect. Without them a route is modelled as unrestricted, which overstates what can run.",
  },
  "9": {
    capability: "Network reference",
    criticality: "important",
    effect: "Unavailable. Bridge class and maximum allowable axle mass cap wagon loading. No axle-mass limit can be enforced without it.",
  },
  "10": {
    capability: "Train operations",
    criticality: "reference",
    effect: "Unavailable. Centralised traffic control system inventory — integration context only.",
  },
  "11": {
    capability: "Train operations",
    criticality: "reference",
    effect: "Unavailable. Abbreviations and descriptions for the CAS systems above.",
  },
  "12": {
    capability: "Network reference",
    criticality: "reference",
    effect: "Unavailable. Depot boundary diagrams — useful for site context, no workflow depends on them.",
  },
  "13": {
    capability: "Network reference",
    criticality: "reference",
    effect: "Unavailable. Pantograph specification — a rolling-stock technical detail.",
  },
  "14": {
    capability: "Network reference",
    criticality: "reference",
    effect: "Unavailable. Diesel nozzle specification — a fuelling technical detail.",
  },
  "23": {
    capability: "Train operations",
    criticality: "reference",
    effect: "Unavailable. Shunting rolling-stock specifications for yards — yard-planning context.",
  },
  "17": {
    capability: "Network reference",
    route: "/rail/investment",
    criticality: "important",
    effect: "Delivered (July 2026). Shows approved capital investment by corridor, which explains why future section capacity is projected to move.",
  },

  // ── Chapter 3 — access ───────────────────────────────────────────────────────
  "15": {
    capability: "Access & contracting",
    route: "/rail/agreement",
    criticality: "important",
    effect: "Delivered as a 95-page MODEL AGREEMENT — unexecuted, with blank Access Seeker, blank commencement date and blank Annexure A. It evidences the contract structure a TOC must sign, not any operator's rights or allocations.",
  },
  "16": {
    capability: "Access & contracting",
    criticality: "reference",
    effect: "Unavailable. A contact list for the Faculty of Rail team — administrative.",
  },

  // ── Chapter 4 — capacity, allocation and contracting ─────────────────────────
  "24": {
    capability: "Safety & occurrences",
    criticality: "blocker",
    effect: "Unavailable. The Interface Management Agreement allocates occurrence responsibility and cost between IM and operator. Annexure 18's cost matrix is only an excerpt and says it will be amended; without the signed interface agreement, no occurrence can be attributed to a party with authority.",
  },
  "25": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. A self-screening checklist an applicant completes — one of the Annexure 15 clause 4.1 conditions precedent, so its absence leaves that condition untrackable.",
  },
  "26": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. Environmental analysis is named in Annexure 15 clause 4.1.2 as required for the application pack.",
  },
  "27": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. Risk analysis guidelines are also named in clause 4.1.2; without them the risk-analysis annexure cannot be templated.",
  },
  "28": {
    capability: "Train operations",
    route: "/rail/access",
    criticality: "important",
    effect: "Delivered (v2.5). The 19-step daily IM↔TOC deviation reconciliation, with its 24/48/72-hour escalation ladder, is modelled and browsable.",
  },
  "29a": {
    capability: "Access & contracting",
    route: "/rail/access",
    criticality: "important",
    effect: "Delivered. The POPIA-noticed access application form, including the ten en-route stoppage types.",
  },
  "30": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. The credit application is a clause 4.1.4 condition precedent — an applicant cannot complete onboarding without it.",
  },
  "31": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. The TRIM NDA gates any exchange of commercial data, so it stands between us and the executed-agreement material.",
  },
  "32": {
    capability: "Capacity & allocation",
    route: "/rail/access",
    criticality: "important",
    effect: "Delivered (v1.5, V3-era). The ad hoc slot request path is modelled; note the filename/revision-history mismatch preserved as E-ANX32-01.",
  },
  "33": {
    capability: "Capacity & allocation",
    route: "/rail/register",
    criticality: "important",
    effect: "Delivered (June 2026 v0.3, 8 pp). Declares capacity methodology, the ten routes, the critical sections and the allocation criteria — but its section-by-section slot data and N1/N2 classification live in a separate appended file that has never been supplied.",
  },
  "33a": {
    capability: "Train operations",
    route: "/rail/timetable",
    criticality: "important",
    effect: "Delivered in full — the 251,678-row point-to-point running-time corpus, byte-identical across 672 files. This is the source of record for scheduled running times.",
  },
  "33b": {
    capability: "Capacity & allocation",
    route: "/rail/slots",
    criticality: "important",
    effect: "Delivered in the 2026-10-23 revision. 1,035 section rows with theoretical, lost, recoverable, allocated and spare capacity for all five fiscal years, retiring the former sparse-cell caveat (E-33B-01).",
  },
  "34": {
    capability: "Access & contracting",
    criticality: "important",
    effect: "Unavailable. The volume confirmation letter is part of the application pack.",
  },
  "29b": {
    capability: "Capacity & allocation",
    route: "/rail/access",
    criticality: "reference",
    effect: "Delivered but V3-era (2024/25, February 2025) and period-caveated as E-ANX29B-01. Retained for historical context; superseded by Annexure 33 for V4.",
  },

  // ── Chapter 5 — occurrences ──────────────────────────────────────────────────
  "18": {
    capability: "Safety & occurrences",
    route: "/rail/occurrence",
    criticality: "important",
    effect: "Delivered as a V3-era excerpt of the occurrence-management roles and costs tables, explicitly marked as still referring to Transnet and to be amended once the IM is established (E-ANX18-00). Not configurable as live liability logic.",
  },
  "22": {
    capability: "Safety & occurrences",
    route: "/rail/occurrence",
    criticality: "reference",
    effect: "Delivered (Rev 6, 2018). Ore loading profiles, with the filename/title divergence preserved as E-ANX22-01.",
  },

  // ── Chapter 6 — operations, safety and incidents ─────────────────────────────
  "19A": {
    capability: "Safety & occurrences",
    criticality: "blocker",
    effect: "Unavailable. Principles of Safe Movement on Rail. Along with 19B and 19C these are the safe-working rulebook; without them no driver-facing rail safety instruction can be authored or checked.",
  },
  "19B": {
    capability: "Safety & occurrences",
    criticality: "blocker",
    effect: "Unavailable. Train Working Rules Part 1–7 — the operating rules a train crew follows.",
  },
  "19C": {
    capability: "Safety & occurrences",
    criticality: "blocker",
    effect: "Unavailable. General Appendix No. 6, the third leg of the safe-working set.",
  },
  "20a": {
    capability: "Train operations",
    route: "/rail/cancellations",
    criticality: "important",
    effect: "Delivered (v4, 30 Sep 2024). The cancel/re-schedule process is modelled end to end.",
  },
  "20b": {
    capability: "Train operations",
    route: "/rail/cancellations",
    criticality: "important",
    effect: "Delivered (v1.3). The cancellation reason → responsible party table, which makes attribution possible.",
  },
  "21": {
    capability: "Train operations",
    route: "/rail/cancellations",
    criticality: "important",
    effect: "Delivered (v5). The clearinghouse narrative that sits downstream of the daily handshake.",
  },
  "35": {
    capability: "Access & contracting",
    route: "/rail/access",
    criticality: "important",
    effect: "Delivered (Version 01). The 22-step TRIM dispute escalation ending at the Rail Regulator. Slot-application disputes are expressly excluded and follow a separate, unsupplied process.",
  },
  "36": {
    capability: "Safety & occurrences",
    route: "/rail/emergency",
    criticality: "important",
    effect: "Delivered (v4, 2024.09.30, 73 pp). Activation levels, scenario matrix, on-site command, the Tribunal and the hazmat directory. Its own §8.1 sub-annexures remain outstanding.",
  },
  "37": {
    capability: "Train operations",
    criticality: "blocker",
    effect: "Unavailable. The monthly order procedure. Annexure 15 prices slot cancellations against orders, and the KPI set measures TOC non-usage of allocated slots — neither can be operationalised without the order that starts the cycle.",
  },
  "38": {
    capability: "Train operations",
    criticality: "blocker",
    effect: "Unavailable. The weekly train path order capture procedure. This is the document that turns an allocation into a specific working, so the handshake and cancellation workflows currently begin from an assumption rather than a source.",
  },
  "39": {
    capability: "Train operations",
    criticality: "blocker",
    effect: "Unavailable. The procedure for resolving handshake disputes. The Daily Handshake page shows the escalation ladder from Annexure 28 but has no source for how a dispute is actually closed.",
  },
  "41": {
    capability: "Safety & occurrences",
    route: "/rail/occurrence",
    criticality: "important",
    effect: "Delivered. The Regulator-facing occurrence reporting procedure — the reporting lifecycle this product's occurrence module follows.",
  },
  "43": {
    capability: "Commercial",
    route: "/rail/kpis",
    criticality: "important",
    effect: "Delivered (xlsx). Route baselines and targets for the current and future KPI frameworks. Targets are supplied; actuals are not, so every variance view remains plan-versus-target rather than actual.",
  },

  // ── Chapter 7 — commercial ───────────────────────────────────────────────────
  "40": {
    capability: "Commercial",
    route: "/rail/tariffs",
    criticality: "important",
    effect: "Delivered. The 2026/27 ancillary services catalogue. Ancillary rates the Network Statement defers to a future volume remain outstanding.",
  },
};

/**
 * Gaps that are NOT standalone annexures — sub-components of delivered documents, or sources
 * outside the Network Statement register entirely. Keeping them separate stops them hiding
 * behind a green tick on the parent document.
 */
export interface DerivedGap {
  id: string;
  title: string;
  parent: string;
  capability: CoverageCapability;
  criticality: Criticality;
  effect: string;
}

export const derivedGaps: DerivedGap[] = [
  {
    id: "33-append",
    title: "Annexure 33 appended data file (section slots + N1/N2 line class)",
    parent: "Annexure 33",
    capability: "Network reference",
    criticality: "blocker",
    effect:
      "Named by the register itself: §1 puts section-by-section slot capacity in a downloadable file appended to the annexure and expressly not in the PDF, and §3 puts the per-section N1/N2 classification in the same file. It has never been supplied. Annexure 33b covers the capacity half at section level, but the line-class half has no substitute — it must not be inferred from KPI sheet headers or corridor names.",
  },
  {
    id: "36-81",
    title: "Annexure 36 §8.1 sub-annexures",
    parent: "Annexure 36",
    capability: "Safety & occurrences",
    criticality: "important",
    effect:
      "The Emergency Response Plan points to ten further documents — Crisis Communication Strategy, the S.O.A.R hazardous-material occurrence form, the RIC 48-hour report, the Spad +72 report, PRASA Shosholoza Meyl and Metro Rail plans, the Gautrain (Mbombela Consortium) plan and the Incident Command System. None is held; all ten are listed on the emergency page as outstanding rather than assumed.",
  },
  {
    id: "raa-executed",
    title: "Executed operator agreements (and any amendments)",
    parent: "Annexure 15",
    capability: "Access & contracting",
    criticality: "blocker",
    effect:
      "The model agreement is unexecuted: no Access Seeker identity, no commencement date, no allocated slots in Annexure A, no signatures. Until a signed agreement exists for an operator, that operator has no evidenced entitlement, and tenant onboarding cannot be driven from TOC column numbers in the capacity workbook.",
  },
  {
    id: "actuals",
    title: "Operational actuals (SPRINT OTD, realised transit, TSR logs)",
    parent: "Annexure 43",
    capability: "Commercial",
    criticality: "important",
    effect:
      "Annexure 43 supplies baselines and targets only. With no actuals feed, KPI variance is planned-versus-target everywhere; no view can report performance achieved.",
  },
  {
    id: "tariff-ancillary",
    title: "Ancillary and marshalling rates beyond the indicative set",
    parent: "Network Statement V4 ch.7 / Annexure 40",
    capability: "Commercial",
    criticality: "important",
    effect:
      "The Network Statement defers the ancillary half of the tariff to a future volume and gives only indicative marshalling figures in Table 18 (E-TARIFF-01). Access fees and the catalogue are delivered; these rates are not.",
  },
];

/** Convenience joins — the page never re-implements these. */
export interface CoverageRow {
  id: string;
  title: string;
  chapter: string;
  delivered: boolean;
  note?: string;
  capability: CoverageCapability;
  criticality: Criticality;
  route?: string;
  effect: string;
}

export const coverageRows: CoverageRow[] = annexureRegister.map((a) => {
  const meta = coverageMeta[a.id];
  if (!meta) {
    throw new Error(
      `railCoverageData: annexure "${a.id}" has no coverage metadata. Add it to coverageMeta so the coverage view cannot silently under-report.`,
    );
  }
  return {
    id: a.id,
    title: a.title,
    chapter: a.chapter,
    delivered: a.have,
    note: a.note,
    capability: meta.capability,
    criticality: meta.criticality,
    route: meta.route,
    effect: meta.effect,
  };
});

export const coverageSummary = {
  total: coverageRows.length,
  delivered: coverageRows.filter((r) => r.delivered).length,
  outstanding: coverageRows.filter((r) => !r.delivered).length,
  blockers: coverageRows.filter((r) => !r.delivered && r.criticality === "blocker").length,
  outstandingImportant: coverageRows.filter((r) => !r.delivered && r.criticality === "important").length,
  outstandingReference: coverageRows.filter((r) => !r.delivered && r.criticality === "reference").length,
};

export const capabilities: CoverageCapability[] = [
  "Network reference",
  "Capacity & allocation",
  "Access & contracting",
  "Train operations",
  "Safety & occurrences",
  "Commercial",
];

/**
 * The ordered ask — what to request from Transnet next, highest impact first.
 * Derived from criticality, then from how many separate workflows the gap touches.
 */
export const requestOrder: Array<{ rank: number; ids: string[]; why: string }> = [
  {
    rank: 1,
    ids: ["33-append", "6"],
    why: "One file closes two register entries and the only remaining structural dimension of the network model: the per-section N1/N2 line class. Everything else about capacity is already at section level.",
  },
  {
    rank: 2,
    ids: ["37", "38", "39"],
    why: "The order cycle that surrounds the daily handshake. The handshake, cancellation and KPI-remedy workflows all reference orders that this product cannot currently produce or reconcile.",
  },
  {
    rank: 3,
    ids: ["19A", "19B", "19C"],
    why: "The safe-working rulebook. Nothing driver-facing can be authored on rail safety until these exist, and this product already has a driver portal to put them in.",
  },
  {
    rank: 4,
    ids: ["24", "raa-executed"],
    why: "Authority to allocate occurrence cost and to recognise an operator's entitlement. Both are contractual, so both depend on executed documents rather than published annexures.",
  },
  {
    rank: 5,
    ids: ["30", "31", "34", "25", "26", "27"],
    why: "The onboarding pack referenced by Annexure 15 clause 4.1.2 and 4.1.4. Low effort for the IM to release, and it turns the readiness checklist into something an applicant can complete.",
  },
];
