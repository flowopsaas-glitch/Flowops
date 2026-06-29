/**
 * Shared parcel-label printing helpers.
 *
 * One place for the "fetch the label PDF and open/print it" logic so every
 * surface that inducts or handles parcels — the Waybills capture wizard, the
 * Shipments register, the Waybill Inbox (OCR), Batch Scan, the Warehouse Hub,
 * driver flows, or any future department — prints labels the same way.
 *
 * Backend:
 *   GET  /waybills/:id/label      → single 4x6" label PDF
 *   POST /waybills/labels {ids}   → many labels in one PDF
 * Both are staff-role gated server-side.
 */
import { api } from "../api/client";

function openOrDownloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  // Prefer opening in a new tab (lets the user hit the printer dialog directly).
  const win = window.open(url, "_blank");
  if (!win) {
    // Popup blocked — fall back to a direct download.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Revoke after a delay so the new tab has time to load the PDF.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Print a single waybill's parcel label. */
export async function printWaybillLabel(id: string): Promise<void> {
  if (!id) return;
  const blob = await api.get<Blob>(`/waybills/${id}/label`, {
    responseType: "blob",
  } as any);
  openOrDownloadPdf(blob as unknown as Blob, `label-${id}.pdf`);
}

/** Print parcel labels for many waybills in a single PDF (one per page). */
export async function printWaybillLabels(ids: Array<string | null | undefined>): Promise<number> {
  const clean = [...new Set(ids.filter(Boolean) as string[])];
  if (clean.length === 0) return 0;
  if (clean.length === 1) {
    await printWaybillLabel(clean[0]);
    return 1;
  }
  const blob = await api.post<Blob>(
    "/waybills/labels",
    { ids: clean },
    { responseType: "blob" } as any,
  );
  openOrDownloadPdf(blob as unknown as Blob, `labels-${clean.length}.pdf`);
  return clean.length;
}
