/**
 * Renders the extracted-annexure markdown straight from the typed catalogs in
 * backend/src/rail/catalog, so the documents cannot disagree with the code.
 *
 *   - `renderFullCapture()`  → docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-…md §13 (full tables)
 *   - `renderCodeIndex()`    → docs/RAIL-RASA-AUDIT-…md Appendix A (compact code index)
 *
 * Both are written between BEGIN/END markers by docs/tools/render-annexure-captures.ts and are
 * checked by backend/src/rail/rail-docs-sync.spec.ts. Test-support only: excluded from the build.
 */
import { CANCELLATION_CODE_CATALOG, ANNEXURE_20B_VERSION } from '../../src/rail/catalog/cancellation-codes.catalog';
import { ANCILLARY_SERVICE_CATALOG, ANNEXURE_40_VERSION, AncillaryServiceLine } from '../../src/rail/catalog/ancillary-services.catalog';
import { SELF_SCREENING_QUESTIONS, SELF_SCREENING_VERSION } from '../../src/rail/catalog/self-screening.catalog';
import {
  ANNEXURE_20A_TIMINGS, ANNEXURE_20A_VERSION, ANNEXURE_21_RULES, CANCELLATION_INITIATORS, CANCELLATION_PROCESS_STEPS, ITP_PLANNING_VERSIONS,
} from '../../src/rail/catalog/cancellation-process.catalog';
import { CORRIDOR_CATALOG } from '../../src/rail/catalog/corridors.catalog';
import { EXPECTED_CORRIDOR_COUNT, EXPECTED_TRANSFER_YARD_COUNT, YARD_CATALOG } from '../../src/rail/catalog/yards.catalog';
import { RAIL_ELECTRIFICATION_LABEL, RAIL_GAUGE_LABEL } from '../../src/rail/rail-reference';
import type { RailElectrification } from '@prisma/client';

export const MARKERS = {
  full: { begin: '<!-- BEGIN GENERATED: annexure-captures — do not edit; run `docs/tools/render-annexure-captures.ts` -->', end: '<!-- END GENERATED: annexure-captures -->' },
  index: { begin: '<!-- BEGIN GENERATED: annexure-code-index — do not edit; run `docs/tools/render-annexure-captures.ts` -->', end: '<!-- END GENERATED: annexure-code-index -->' },
} as const;

const esc = (s: string) => s.replace(/\|/g, '\\|');
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');

const PARTY_LABEL = {
  RAIL_OPERATIONS: 'Rail Operations (TOC side)', INFRASTRUCTURE_MANAGER: 'Infrastructure Manager (TRIM)', FORCE_MAJEURE: 'Force Majeure',
  ALLOCATION_REQUIRED: 'Allocation required — Clearinghouse',
} as const;

export function renderCancellationCodes(compact = false): string {
  const head = compact ? ['Code', 'Cancellation reason', 'Responsible party (as printed)'] : ['Code', 'Row', 'Cancellation reason', 'Responsible party (as printed)', 'FlowOps allocation'];
  const rows = CANCELLATION_CODE_CATALOG.map((c) => compact
    ? [c.code, c.reason, c.sourceText]
    : [c.code, String(c.sourceRow), c.reason, c.sourceText, c.responsibleParty === 'ALLOCATION_REQUIRED' ? `${PARTY_LABEL.ALLOCATION_REQUIRED} (${c.possibleParties.map((p) => PARTY_LABEL[p]).join(' / ')})` : PARTY_LABEL[c.responsibleParty]]);
  return table(head, rows);
}

function tiers(): Array<[number, string, AncillaryServiceLine[]]> {
  return [1, 2, 3, 4].map((t) => {
    const lines = ANCILLARY_SERVICE_CATALOG.filter((l) => l.tier === t);
    return [t, lines[0].tierName, lines] as [number, string, AncillaryServiceLine[]];
  });
}

export function renderAncillaryServices(compact = false): string {
  return tiers().map(([t, name, lines]) => {
    const head = compact ? ['Code', 'Service / line', 'Unit of measure'] : ['Code', '#', 'Service', 'Line', 'Unit of measure', 'Price'];
    const rows = lines.map((l) => compact
      ? [l.code, l.name === l.serviceName ? l.name : `${l.serviceNumber}. ${l.name}`, l.unitOfMeasure]
      : [l.code, String(l.serviceNumber), l.serviceName, `${l.sourceLabel ? `(${l.sourceLabel}) ` : ''}${l.section ? `[${l.section}] ` : ''}${l.name === l.serviceName ? '—' : l.name}`, l.unitOfMeasure, l.priceStatus === 'TBD' ? 'TBD (≠ free)' : 'not published']);
    return `**Tier ${t} — ${name}${t === 1 ? ' (safety critical and compulsory)' : ''}** — ${lines.length} line(s)\n\n${table(head, rows)}`;
  }).join('\n\n');
}

export function renderSelfScreening(): string {
  return table(['No.', 'Key', 'Assessment (verbatim)', 'Evidence requested / refers to'],
    SELF_SCREENING_QUESTIONS.map((q) => [`(${q.no})`, q.key, q.assessment, [q.evidenceRequested, q.refers && `Refers to: ${q.refers}`].filter(Boolean).join(' · ') || '—']));
}

export function renderProcess(): string {
  const steps = table(['Step', 'Path', 'Title', 'Detail'],
    CANCELLATION_PROCESS_STEPS.map((s) => [`${s.step}${s.stepNumberInferred ? '*' : ''}`, s.path, s.title, s.detail.join(' · ') || '—']));
  const init = table(['Step', 'Initiator', 'Channel'], CANCELLATION_INITIATORS.map((i) => [String(i.step), i.label, i.via ?? '—']));
  const timings = table(['Quantity', 'Value', 'Source'], [
    ['Cancellation notice', `within ${ANNEXURE_20A_TIMINGS.noticeWithinMinutes} minutes of the event / discovery`, '[ANX-20a steps 1–4]'],
    ['Acknowledge receipt', `within ${ANNEXURE_20A_TIMINGS.acknowledgeWithinHours} hour`, '[ANX-20a step 6]'],
    ['Short-notice threshold', `${ANNEXURE_20A_TIMINGS.shortNoticeThresholdHours} hours before real time`, '[ANX-20a decision]'],
    ['ITP planning versions', ITP_PLANNING_VERSIONS.join(' / '), '[ANX-20a step 14, >48 h path]'],
    ['Clearinghouse dispute window', `${ANNEXURE_21_RULES.disputeWindowHours} hours`, '[ANX-21 business rules]'],
    ['Closed to dispute after', `${ANNEXURE_21_RULES.closedToDisputeAfterHours} hours`, '[ANX-21 business rules]'],
    ['Unresolved-dispute investigation', `within ${ANNEXURE_21_RULES.unresolvedInvestigationWithinHours} hours (Network Operations Interface Manager)`, '[ANX-21 process]'],
    ['National Clearinghouse', `Tue–Fri ${ANNEXURE_21_RULES.nationalClearinghouse.tueToFri}; Mon ${ANNEXURE_21_RULES.nationalClearinghouse.monday}`, '[ANX-21 business rules]'],
  ]);
  return `${steps}\n\n\\* step number not printed in the source; inferred from the sequence.\n\n**Initiators (steps 1–5)**\n\n${init}\n\n**Timings and windows quoted by the annexures**\n\n${timings}`;
}

/** One corridor's envelope, exactly as the catalog holds it — never summarised. */
function envelopeCell(c: (typeof CORRIDOR_CATALOG)[number]): string {
  const gauge = c.gauge ? RAIL_GAUGE_LABEL[c.gauge] : '—';
  const elec = c.electrification.map((e) => RAIL_ELECTRIFICATION_LABEL[e as RailElectrification]).join('/') || '—';
  const axle = c.maxAxleLoadTonnes == null ? '—' : `${c.maxAxleLoadTonnes} t`;
  const len = c.maxTrainLengthM == null ? '—' : `${c.maxTrainLengthM} m`;
  const cell = `${gauge} / ${elec} / ${axle} / ${c.vehicleProfile ?? '—'} / ${len}`;
  const ex = (c.envelopeExceptions ?? []).map((e) => {
    const what = e.kind === 'AXLE_LOAD' ? `${e.tonnes} t` : e.kind === 'GAUGE' ? (e.gauge ? RAIL_GAUGE_LABEL[e.gauge] : '—') : `${e.metres} m`;
    return `${what} on ${e.sections}`;
  });
  return ex.length ? `${cell}<br>Exceptions: ${ex.join('; ')}` : cell;
}

export function renderReferenceState(): string {
  const rows = CORRIDOR_CATALOG.map((c) => [c.code, c.name, c.aliases.join(', ') || '—', c.workbookRoutes.join('; '), c.dataStatus, envelopeCell(c)]);
  const statuses = new Set(CORRIDOR_CATALOG.map((c) => c.dataStatus));
  const statusNote = [...statuses].sort().map((s) => `\`${s}\``).join(', ');
  return `${table(['Code', 'V4 corridor', 'Pre-V4 aliases', 'Annexure 33b routes (indicative)', 'Data status', 'Gauge / electrification / axle load / profile / train length'], rows)}\n\nTransfer yards in the catalog: **${YARD_CATALOG.length} of ${EXPECTED_TRANSFER_YARD_COUNT}** expected by the brief (none supplied). Corridors: **${CORRIDOR_CATALOG.length} of ${EXPECTED_CORRIDOR_COUNT}**, status: ${statusNote}. Gauge, electrification, axle load and train length come from Network Statement V4 Chapter 2 §2.8–2.13; the vehicle profile is still missing because Annexures 2 and 3 were never supplied, so no corridor is \`VERIFIED\`.`;
}

export function renderFullCapture(): string {
  const n40 = ANCILLARY_SERVICE_CATALOG.length;
  return `${MARKERS.full.begin}

### 13.1 Annexure 20b — main train cancellation reasons allocated to responsible parties (${ANNEXURE_20B_VERSION})

${CANCELLATION_CODE_CATALOG.length} rows, in source order. The annexure has no codes; \`CNX-nnn\` is a FlowOps-assigned stable key (= source row number in this version; append, never renumber). Source: \`backend/src/rail/catalog/cancellation-codes.catalog.ts\`.

${renderCancellationCodes()}

### 13.2 Annexure 40 — TRIM ancillary services catalogue (${ANNEXURE_40_VERSION})

40 numbered services in 4 tiers, flattened to ${n40} priced lines. **The annexure publishes no prices** — only units of measure; \`TBD\` is not zero. Source: \`backend/src/rail/catalog/ancillary-services.catalog.ts\`.

${renderAncillaryServices()}

### 13.3 Annexure 25 — TOC self-screening form (${SELF_SCREENING_VERSION})

The document is a **draft**. Source: \`backend/src/rail/catalog/self-screening.catalog.ts\`.

${renderSelfScreening()}

### 13.4 Annexure 20a — cancel or re-plan / re-schedule TOC train process (${ANNEXURE_20A_VERSION}) and Annexure 21 rules

Roles only: the named individuals in the sign-off blocks are withheld (POPIA, register EXC-022). Source: \`backend/src/rail/catalog/cancellation-process.catalog.ts\`.

${renderProcess()}

### 13.5 Reference data actually loaded (corridors and yards)

Source: \`backend/src/rail/catalog/corridors.catalog.ts\`, \`yards.catalog.ts\`.

${renderReferenceState()}

${MARKERS.full.end}`;
}

export function renderCodeIndex(): string {
  return `${MARKERS.index.begin}

**A.1 Annexure 20b cancellation codes** (${CANCELLATION_CODE_CATALOG.length})

${renderCancellationCodes(true)}

**A.2 Annexure 40 ancillary service codes** (${ANCILLARY_SERVICE_CATALOG.length} lines)

${renderAncillaryServices(true)}

${MARKERS.index.end}`;
}

/** Replace the text between two markers (inclusive) with `block`. Throws if the markers are absent. */
export function replaceBetweenMarkers(doc: string, markers: { begin: string; end: string }, block: string): string {
  const a = doc.indexOf(markers.begin);
  const b = doc.indexOf(markers.end);
  if (a < 0 || b < 0 || b < a) throw new Error(`markers not found: ${markers.begin.slice(0, 60)}…`);
  return doc.slice(0, a) + block + doc.slice(b + markers.end.length);
}

export function extractBetweenMarkers(doc: string, markers: { begin: string; end: string }): string | null {
  const a = doc.indexOf(markers.begin);
  const b = doc.indexOf(markers.end);
  return a < 0 || b < 0 || b < a ? null : doc.slice(a, b + markers.end.length);
}
