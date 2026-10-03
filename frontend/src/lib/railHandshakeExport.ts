/**
 * Daily Handshake — evidence export (CSV + print/PDF dossier).
 *
 * The builders are pure (no DOM) so they can be unit-tested. The two thin
 * browser helpers at the bottom (`downloadTextFile`, `printHtmlDocument`) are the
 * only parts that touch `document`.
 *
 * No PDF library and no binary is involved: "PDF" is the browser's own
 * print-to-PDF of the dossier HTML.
 */
import {
  DEVIATION_CATEGORY_LABEL,
  ESCALATION_LABEL,
  RESPONSIBLE_PARTY_LABEL,
  type HandshakeDeviation,
  type HandshakeReport,
} from "../api/railHandshakeApi";

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Excel, Google Sheets and LibreOffice execute a cell that starts with
 * `=  +  -  @` (or TAB / CR) as a formula. Deviation text is typed by users and
 * exported to files other people open, so such cells are defused with a leading
 * apostrophe (the standard OWASP "CSV injection" mitigation).
 */
export function neutraliseSpreadsheetFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** One RFC-4180 cell. Numbers are written as-is (a negative number is not a formula). */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = neutraliseSpreadsheetFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const iso = (v?: string | null): string => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

type CsvColumn = {
  label: string;
  get: (r: HandshakeReport, d?: HandshakeDeviation) => unknown;
};

/** One row per deviation; the report-level columns repeat so the sheet filters and pivots cleanly. */
export const HANDSHAKE_CSV_COLUMNS: CsvColumn[] = [
  { label: "Report No", get: (r) => r.reportNumber },
  { label: "Report Status", get: (r) => r.status },
  { label: "Operating Day", get: (r) => iso(r.reportDate).slice(0, 10) },
  { label: "Window Start (UTC)", get: (r) => iso(r.windowStart) },
  { label: "Window End (UTC)", get: (r) => iso(r.windowEnd) },
  { label: "Corridor", get: (r) => r.corridor },
  { label: "Infrastructure Manager", get: (r) => r.railOperator },
  { label: "IM Reference (TOL)", get: (r) => r.imReference },
  { label: "Signed Off By (verified)", get: (r) => r.signedOffBy },
  { label: "Signed Off At (UTC)", get: (r) => iso(r.signedOffAt) },
  { label: "Train/Slot Ref", get: (_r, d) => d?.trainSlotRef },
  { label: "Order No", get: (_r, d) => d?.orderNumber },
  { label: "Category", get: (_r, d) => (d ? DEVIATION_CATEGORY_LABEL[d.category] ?? d.category : "") },
  { label: "Reason", get: (_r, d) => d?.reason },
  { label: "Root Cause", get: (_r, d) => d?.rootCause },
  { label: "Location", get: (_r, d) => d?.location },
  { label: "Occurred At (UTC)", get: (_r, d) => iso(d?.occurredAt) },
  { label: "Delay (min)", get: (_r, d) => d?.delayMinutes },
  { label: "Responsible Party", get: (_r, d) => (d ? RESPONSIBLE_PARTY_LABEL[d.responsibleParty] ?? d.responsibleParty : "") },
  { label: "Slot Impact", get: (_r, d) => d?.slotImpact },
  { label: "Cost (ZAR)", get: (_r, d) => d?.costZar },
  { label: "Cost Recovered", get: (_r, d) => (d ? d.costRecovered : "") },
  { label: "Deviation Status", get: (_r, d) => d?.status },
  { label: "Escalation Stage", get: (_r, d) => (d ? ESCALATION_LABEL[d.escalationStage] ?? d.escalationStage : "") },
  { label: "Dispute Reason", get: (_r, d) => d?.disputeReason },
  { label: "Resolution Note", get: (_r, d) => d?.resolutionNote },
  { label: "Resolved At (UTC)", get: (_r, d) => iso(d?.resolvedAt) },
  { label: "Consignment Id", get: (_r, d) => d?.consignmentId },
];

/**
 * The report as CSV. A report with no deviations still yields a header row and
 * one report-level row, so the export is never an empty file.
 * Starts with a UTF-8 BOM so Excel reads non-ASCII text correctly.
 */
export function buildHandshakeCsv(report: HandshakeReport): string {
  const deviations = report.deviations ?? [];
  const rows: Array<HandshakeDeviation | undefined> = deviations.length ? deviations : [undefined];
  const lines = [
    HANDSHAKE_CSV_COLUMNS.map((c) => csvCell(c.label)).join(","),
    ...rows.map((d) => HANDSHAKE_CSV_COLUMNS.map((c) => csvCell(c.get(report, d))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const safeFilePart = (text: string) => text.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "") || "report";

export function handshakeCsvFilename(report: HandshakeReport, now: Date = new Date()): string {
  return `${safeFilePart(report.reportNumber)}-handshake-${now.toISOString().slice(0, 10)}.csv`;
}

// ── Print / PDF dossier ──────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = (v?: number | null) => (v == null ? "—" : `R${Math.round(v).toLocaleString("en-ZA")}`);
const dt = (v?: string | null) => {
  const s = iso(v);
  return s ? s.replace("T", " ").replace(/:\d\d\.\d{3}Z$/, " UTC") : "—";
};
const cell = (v: unknown) => (v == null || v === "" ? "—" : escapeHtml(v));

/** Roll-ups shown at the top of the dossier (also unit-tested). */
export function summariseHandshake(report: HandshakeReport) {
  const devs = report.deviations ?? [];
  const byStatus: Record<string, number> = {};
  for (const d of devs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  const notOurs = new Set(["IM", "ANOTHER_TOC", "EXTERNAL"]);
  return {
    total: devs.length,
    byStatus,
    totalDelayMinutes: devs.reduce((s, d) => s + (d.delayMinutes ?? 0), 0),
    totalCostZar: devs.reduce((s, d) => s + (d.costZar ?? 0), 0),
    recoverableZar: devs
      .filter((d) => notOurs.has(d.responsibleParty) && !d.costRecovered)
      .reduce((s, d) => s + (d.costZar ?? 0), 0),
  };
}

export function buildHandshakeDossierHtml(
  report: HandshakeReport,
  opts: { generatedAt?: Date; generatedBy?: string } = {},
): string {
  const generatedAt = (opts.generatedAt ?? new Date()).toISOString();
  const devs = report.deviations ?? [];
  const sum = summariseHandshake(report);

  const deviationBlocks = devs.length
    ? devs
        .map(
          (d, i) => `
      <section class="dev">
        <h3>${i + 1}. ${escapeHtml(d.trainSlotRef)}${d.orderNumber ? ` <span class="muted">· Order ${escapeHtml(d.orderNumber)}</span>` : ""}
          <span class="chip">${escapeHtml(d.status)}</span></h3>
        <table>
          <tr><th>Category</th><td>${cell(DEVIATION_CATEGORY_LABEL[d.category] ?? d.category)}</td>
              <th>Responsible party</th><td>${cell(RESPONSIBLE_PARTY_LABEL[d.responsibleParty] ?? d.responsibleParty)}</td></tr>
          <tr><th>Reason</th><td colspan="3">${cell(d.reason)}</td></tr>
          <tr><th>Root cause</th><td colspan="3">${cell(d.rootCause)}</td></tr>
          <tr><th>Location</th><td>${cell(d.location)}</td><th>Occurred</th><td>${dt(d.occurredAt)}</td></tr>
          <tr><th>Delay</th><td>${d.delayMinutes != null ? `${escapeHtml(d.delayMinutes)} min` : "—"}</td>
              <th>Slot impact</th><td>${cell(d.slotImpact)}</td></tr>
          <tr><th>Cost</th><td>${money(d.costZar)}${d.costRecovered ? " (recovered)" : ""}</td>
              <th>Escalation stage</th><td>${cell(ESCALATION_LABEL[d.escalationStage] ?? d.escalationStage)}</td></tr>
          ${d.disputeReason ? `<tr><th>Dispute reason</th><td colspan="3">${cell(d.disputeReason)}</td></tr>` : ""}
          ${d.resolutionNote ? `<tr><th>Resolution</th><td colspan="3">${cell(d.resolutionNote)}${d.resolvedAt ? ` <span class="muted">(${dt(d.resolvedAt)})</span>` : ""}</td></tr>` : ""}
        </table>
      </section>`,
        )
        .join("\n")
    : `<p class="muted">No deviations were logged for this operating day.</p>`;

  const statusLine = Object.entries(sum.byStatus)
    .map(([k, v]) => `${escapeHtml(k)}: ${v}`)
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Handshake dossier — ${escapeHtml(report.reportNumber)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  h3 { font-size: 13px; margin: 0 0 4px; }
  .muted { color: #666; font-weight: normal; }
  .chip { border: 1px solid #555; border-radius: 10px; padding: 0 7px; font-size: 10px; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 3px 6px; border: 1px solid #ccc; }
  th { width: 17%; background: #f3f3f3; font-weight: 600; }
  .dev { margin: 10px 0; break-inside: avoid; }
  .sig td { height: 34px; }
  footer { margin-top: 18px; font-size: 10px; color: #555; border-top: 1px solid #999; padding-top: 6px; }
</style>
</head>
<body>
  <h1>Daily Handshake — Evidence Dossier</h1>
  <div class="muted">Transnet Network Statement · Annexure 28 · TOC ↔ Infrastructure Manager deviation reconciliation</div>

  <h2>Report</h2>
  <table>
    <tr><th>Report</th><td>${escapeHtml(report.reportNumber)} <span class="chip">${escapeHtml(report.status)}</span></td>
        <th>Operating day</th><td>${escapeHtml(iso(report.reportDate).slice(0, 10) || "—")}</td></tr>
    <tr><th>Window</th><td colspan="3">${dt(report.windowStart)} → ${dt(report.windowEnd)}</td></tr>
    <tr><th>Corridor</th><td>${cell(report.corridor)}</td><th>Infrastructure Manager</th><td>${cell(report.railOperator)}</td></tr>
    <tr><th>IM reference (TOL)</th><td>${cell(report.imReference)}</td><th>Signed off</th>
        <td>${report.signedOffBy ? `${escapeHtml(report.signedOffBy)}<br><span class="muted">${dt(report.signedOffAt)}</span>` : "Not yet signed off"}</td></tr>
    ${report.notes ? `<tr><th>Notes</th><td colspan="3">${cell(report.notes)}</td></tr>` : ""}
  </table>

  <h2>Summary</h2>
  <table>
    <tr><th>Deviations</th><td>${sum.total}${statusLine ? ` <span class="muted">(${statusLine})</span>` : ""}</td>
        <th>Total delay</th><td>${sum.totalDelayMinutes} min</td></tr>
    <tr><th>Total cost</th><td>${money(sum.totalCostZar)}</td>
        <th>Recoverable (not our fault, unrecovered)</th><td>${money(sum.recoverableZar)}</td></tr>
  </table>

  <h2>Deviations</h2>
  ${deviationBlocks}

  <h2>Review</h2>
  <table class="sig">
    <tr><th>Prepared by</th><td></td><th>Date</th><td></td></tr>
    <tr><th>Reviewed by</th><td></td><th>Date</th><td></td></tr>
  </table>

  <footer>
    Generated by FlowOps on ${escapeHtml(generatedAt)}${opts.generatedBy ? ` for ${escapeHtml(opts.generatedBy)}` : ""}.
    This is an evidence extract of the TOC-side handshake record. Escalation stages are those recorded at generation time.
    Where it differs from the Infrastructure Manager's own record, the IM's TOL record governs.
  </footer>
</body>
</html>`;
}

// ── Browser helpers (the only code here that touches `document`) ──────────────

export function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Print an HTML document without opening a window (no pop-up blocker) and without
 * letting it run script: the iframe is sandboxed WITHOUT `allow-scripts`, so even
 * a missed escape could not execute. The browser's print dialog offers
 * "Save as PDF".
 */
export function printHtmlDocument(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  const cleanup = () => frame.remove();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener("afterprint", cleanup);
    win.focus();
    win.print();
    window.setTimeout(cleanup, 120_000); // fallback if afterprint never fires
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
