/**
 * Converts an array of objects to a CSV file and triggers a browser download.
 *
 * @param rows     Array of plain objects (each key = a column)
 * @param filename e.g. "invoices-2026.csv"
 * @param headers  Optional: explicit column order + display names
 *                 e.g. [{ key: "invoiceNumber", label: "Invoice #" }, …]
 *
 * Usage:
 *   exportCsv(invoices, "invoices.csv", [
 *     { key: "invoiceNumber", label: "Invoice #" },
 *     { key: "clientName",    label: "Client"    },
 *     { key: "total",         label: "Total ZAR" },
 *   ]);
 */
export function exportCsv(
  rows: Record<string, unknown>[],
  filename: string,
  headers?: { key: string; label: string }[],
) {
  if (rows.length === 0) return;

  const cols = headers ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));

  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    // Wrap in quotes if contains comma, newline, or double-quote
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [
    cols.map((c) => escape(c.label)).join(","),
    ...rows.map((r) => cols.map((c) => escape(r[c.key])).join(",")),
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Returns a date-stamped filename, e.g. "invoices-2026-06-18.csv" */
export function csvFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
