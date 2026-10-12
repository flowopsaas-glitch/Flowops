import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Printer, RefreshCw } from "lucide-react";
import {
  amendTrainManifest, arriveTrainManifest, cancelTrainManifest, closeTrainManifest, createTrainManifest,
  departTrainManifest, getTrainManifest, issueTrainManifest, listTrainManifests, MANIFEST_STATUS_LABEL,
  updateTrainManifest, type TrainManifest,
} from "../../api/railManifestApi";
import { listConsignments, type RailConsignment } from "../../api/railApi";
import { useToast } from "../../components/ToastProvider";
import { Banner, Field, Modal, Pill, Section, btnDanger, btnNeutral, btnPrimary, inputCls } from "./railUi";
import type { Tone } from "../../lib/railSlot";

/**
 * Digital Train Manifest — the departure document.
 *
 * DRAFT is editable; issuing is a signatory attestation (DG-gated) that freezes
 * the document; corrections go through Amend (a new revision). The print view is
 * the document crews carry.
 */

const STATUS_TONE: Record<TrainManifest["status"], Tone> = {
  DRAFT: "muted", ISSUED: "info", DEPARTED: "warn", ARRIVED: "warn",
  CLOSED: "ok", SUPERSEDED: "muted", CANCELLED: "danger",
};

export default function TrainManifestPanel({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) {
  const { showToast } = useToast();
  const [manifests, setManifests] = useState<TrainManifest[]>([]);
  const [consignments, setConsignments] = useState<RailConsignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<TrainManifest | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [pickConsignment, setPickConsignment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [signName, setSignName] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [edit, setEdit] = useState<{ trainServiceRef: string; locoReference: string; notes: string; wagons: Array<{ position: number; wagonNumber: string; commodity: string; tareTonnes: string; loadedTonnes: string; isDangerousGoods: boolean }> } | null>(null);

  const startEdit = (m: TrainManifest) => {
    setEdit({
      trainServiceRef: m.trainServiceRef ?? "",
      locoReference: m.locoReference ?? "",
      notes: m.notes ?? "",
      wagons: m.wagons.map((w) => ({
        position: w.position, wagonNumber: w.wagonNumber, commodity: w.commodity ?? "",
        tareTonnes: w.tareTonnes != null ? String(w.tareTonnes) : "",
        loadedTonnes: w.loadedTonnes != null ? String(w.loadedTonnes) : "",
        isDangerousGoods: w.isDangerousGoods,
      })),
    });
  };

  const saveDraft = async () => {
    if (!open || !edit) return;
    const payload = {
      trainServiceRef: edit.trainServiceRef || undefined,
      locoReference: edit.locoReference || undefined,
      notes: edit.notes || undefined,
      wagons: edit.wagons
        .filter((w) => w.wagonNumber.trim())
        .map((w, i) => ({
          position: i + 1,
          wagonNumber: w.wagonNumber.trim(),
          commodity: w.commodity || undefined,
          tareTonnes: w.tareTonnes.trim() === "" ? null : Number(w.tareTonnes),
          loadedTonnes: w.loadedTonnes.trim() === "" ? null : Number(w.loadedTonnes),
          isDangerousGoods: w.isDangerousGoods,
        })),
    };
    await act("Save draft", async () => {
      const m = await updateTrainManifest(open.id, payload);
      setOpen(m);
      setEdit(null);
    }, "Draft saved.");
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        listTrainManifests(),
        listConsignments().catch(() => [] as RailConsignment[]),
      ]);
      setManifests(m);
      setConsignments(c);
    } catch (e) {
      showToast(`Could not load train manifests: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openManifest = async (id: string) => {
    try { setOpen(await getTrainManifest(id)); }
    catch (e) { showToast(`Could not open manifest: ${(e as Error)?.message ?? e}`, "error"); }
  };

  const act = async (label: string, fn: () => Promise<unknown>, after?: string) => {
    setBusy(label);
    try {
      await fn();
      showToast(after ?? `${label} recorded.`, "success");
      if (open) await openManifest(open.id);
      await load();
    } catch (e) {
      showToast(`${label} failed: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!pickConsignment) return;
    setShowNew(false);
    await act("Create", async () => {
      const m = await createTrainManifest({ consignmentId: pickConsignment });
      setOpen(m);
    }, "Draft manifest created from the consignment consist.");
    setPickConsignment("");
  };

  const editable = open?.status === "DRAFT";

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading train manifests…</div>;
  }

  return (
    <div className="space-y-5">
      <style>{`@media print { body * { visibility: hidden; } .train-manifest-print, .train-manifest-print * { visibility: visible; } .train-manifest-print { position: absolute; inset: 0; padding: 24px; } }`}</style>

      <Section title="Train manifests" right={
        <div className="flex gap-2">
          {canWrite && (
            <button className={btnPrimary} onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New manifest
            </button>
          )}
          <button className={btnNeutral} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      }>
        {manifests.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">
            No train manifests yet. Create one from a consignment to snapshot its consist into a departure document.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Manifest</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Consignment</th>
                  <th className="py-2 pr-4">Route</th>
                  <th className="py-2 pr-4">Wagons</th>
                  <th className="py-2">Issued</th>
                </tr>
              </thead>
              <tbody>
                {manifests.map((m) => (
                  <tr key={m.id} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]" onClick={() => void openManifest(m.id)}>
                    <td className="py-2 pr-4 font-mono text-white">{m.manifestNumber}{m.revision > 1 ? ` · rev ${m.revision}` : ""}</td>
                    <td className="py-2 pr-4"><Pill tone={STATUS_TONE[m.status]}>{MANIFEST_STATUS_LABEL[m.status]}</Pill></td>
                    <td className="py-2 pr-4 text-slate-300">{m.consignmentNumber}</td>
                    <td className="py-2 pr-4 text-slate-400">{[m.originSiding, m.destinationSiding].filter(Boolean).join(" → ") || m.corridor || "—"}</td>
                    <td className="py-2 pr-4 text-slate-300">{m._count?.wagons ?? m.wagons?.length ?? 0}</td>
                    <td className="py-2 text-slate-400">{m.issuedAt ? new Date(m.issuedAt).toLocaleString("en-ZA") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {showNew && (
        <Modal title="New train manifest" onClose={() => setShowNew(false)}>
          <p className="mb-3 text-xs text-slate-400">
            The manifest snapshots the consignment&apos;s wagons as they stand now. You can edit the draft before issuing.
          </p>
          <Field label="Consignment">
            <select className={inputCls} value={pickConsignment} onChange={(e) => setPickConsignment(e.target.value)} aria-label="Consignment">
              <option value="">Select a consignment…</option>
              {consignments.map((c) => (
                <option key={c.id} value={c.id}>{c.consignmentNumber} — {c.commodity}{c.originSiding ? ` (${c.originSiding} → ${c.destinationSiding ?? "?"})` : ""}</option>
              ))}
            </select>
          </Field>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={() => void create()} disabled={!pickConsignment}>Create draft</button>
            <button className={btnNeutral} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {open && (
        <Modal title={`Train manifest ${open.manifestNumber}${open.revision > 1 ? ` · revision ${open.revision}` : ""}`} onClose={() => setOpen(null)} wide>
          <div className="train-manifest-print space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_TONE[open.status]}>{MANIFEST_STATUS_LABEL[open.status]}</Pill>
              {open.supersedesId && <Pill tone="muted">Supersedes an earlier revision</Pill>}
              <span className="text-xs text-slate-400">Consignment {open.consignmentNumber}</span>
            </div>

            {editable && canWrite && !edit && (
              <button className={btnNeutral} onClick={() => startEdit(open)}>Edit draft</button>
            )}

            {editable && edit && canWrite ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Train service / path ref">
                    <input className={inputCls} value={edit.trainServiceRef} onChange={(e) => setEdit({ ...edit, trainServiceRef: e.target.value })} />
                  </Field>
                  <Field label="Loco reference">
                    <input className={inputCls} value={edit.locoReference} onChange={(e) => setEdit({ ...edit, locoReference: e.target.value })} />
                  </Field>
                </div>
                <div className="rounded-xl border border-white/10">
                  {edit.wagons.map((w, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2 last:border-b-0">
                      <span className="w-6 text-xs text-slate-500">{i + 1}</span>
                      <input className={`${inputCls} w-36`} placeholder="Wagon number" aria-label={`Wagon ${i + 1} number`}
                        value={w.wagonNumber}
                        onChange={(e) => setEdit({ ...edit, wagons: edit.wagons.map((x, j) => j === i ? { ...x, wagonNumber: e.target.value } : x) })} />
                      <input className={`${inputCls} w-32`} placeholder="Commodity" aria-label={`Wagon ${i + 1} commodity`}
                        value={w.commodity}
                        onChange={(e) => setEdit({ ...edit, wagons: edit.wagons.map((x, j) => j === i ? { ...x, commodity: e.target.value } : x) })} />
                      <input className={`${inputCls} w-24`} placeholder="Tare t" aria-label={`Wagon ${i + 1} tare`}
                        value={w.tareTonnes}
                        onChange={(e) => setEdit({ ...edit, wagons: edit.wagons.map((x, j) => j === i ? { ...x, tareTonnes: e.target.value } : x) })} />
                      <input className={`${inputCls} w-24`} placeholder="Loaded t" aria-label={`Wagon ${i + 1} loaded`}
                        value={w.loadedTonnes}
                        onChange={(e) => setEdit({ ...edit, wagons: edit.wagons.map((x, j) => j === i ? { ...x, loadedTonnes: e.target.value } : x) })} />
                      <label className="flex items-center gap-1 text-xs text-slate-300">
                        <input type="checkbox" checked={w.isDangerousGoods} aria-label={`Wagon ${i + 1} dangerous goods`}
                          onChange={(e) => setEdit({ ...edit, wagons: edit.wagons.map((x, j) => j === i ? { ...x, isDangerousGoods: e.target.checked } : x) })} />
                        DG
                      </label>
                      <button className="ml-auto text-xs text-rose-300 hover:text-rose-200"
                        onClick={() => setEdit({ ...edit, wagons: edit.wagons.filter((_, j) => j !== i) })}>
                        remove
                      </button>
                    </div>
                  ))}
                  <button className="w-full px-3 py-2 text-left text-xs text-emerald-300 hover:bg-white/[0.03]"
                    onClick={() => setEdit({ ...edit, wagons: [...edit.wagons, { position: edit.wagons.length + 1, wagonNumber: "", commodity: "", tareTonnes: "", loadedTonnes: "", isDangerousGoods: false }] })}>
                    + add wagon
                  </button>
                </div>
                <Field label="Notes">
                  <textarea className={inputCls} rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                </Field>
                <div className="flex gap-2">
                  <button className={btnPrimary} disabled={busy !== null} onClick={() => void saveDraft()}>
                    {busy === "Save draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft
                  </button>
                  <button className={btnNeutral} onClick={() => setEdit(null)}>Discard edits</button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Train service / path ref"><div className="text-sm text-white">{open.trainServiceRef || "—"}</div></Field>
                  <Field label="Loco reference"><div className="text-sm text-white">{open.locoReference || "—"}</div></Field>
                  <Field label="Origin"><div className="text-sm text-white">{open.originSiding || "—"}</div></Field>
                  <Field label="Destination"><div className="text-sm text-white">{open.destinationSiding || "—"}</div></Field>
                  <Field label="Rail operator"><div className="text-sm text-white">{open.railOperator || "—"}</div></Field>
                  <Field label="Planned departure / arrival">
                    <div className="text-sm text-white">
                      {open.plannedDeparture ? new Date(open.plannedDeparture).toLocaleString("en-ZA") : "—"}
                      {" → "}
                      {open.plannedArrival ? new Date(open.plannedArrival).toLocaleString("en-ZA") : "—"}
                    </div>
                  </Field>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Wagon</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Commodity</th>
                        <th className="py-2 px-3">Tare / Loaded (t)</th>
                        <th className="py-2 px-3">Seals</th>
                        <th className="py-2 px-3">DG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {open.wagons.map((w) => (
                        <tr key={w.id} className="border-b border-white/5">
                          <td className="py-2 px-3 text-slate-400">{w.position}</td>
                          <td className="py-2 px-3 font-mono text-white">{w.wagonNumber}</td>
                          <td className="py-2 px-3 text-slate-300">{String(w.type).replace(/_/g, " ")}</td>
                          <td className="py-2 px-3 text-slate-300">{w.commodity || "—"}</td>
                          <td className="py-2 px-3 text-slate-300">{w.tareTonnes ?? "—"} / {w.loadedTonnes ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-400">{w.sealNumbers || "—"}</td>
                          <td className="py-2 px-3">
                            {w.isDangerousGoods
                              ? <Pill tone="danger">{w.unNumber ?? "DG"}{w.imdgClass ? ` · ${w.imdgClass}` : ""}</Pill>
                              : <span className="text-slate-500">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="grid gap-2 text-xs text-slate-300">
              {open.issuedBy && <div><span className="text-slate-400">Issued:</span> {open.issuedBy} · {new Date(open.issuedAt!).toLocaleString("en-ZA")}</div>}
              {open.departedBy && <div><span className="text-slate-400">Departed:</span> {open.departedBy} · {new Date(open.departedAt!).toLocaleString("en-ZA")}</div>}
              {open.arrivedBy && <div><span className="text-slate-400">Arrived:</span> {open.arrivedBy} · {new Date(open.arrivedAt!).toLocaleString("en-ZA")}</div>}
              {open.closedBy && <div><span className="text-slate-400">Closed:</span> {open.closedBy} · {new Date(open.closedAt!).toLocaleString("en-ZA")}</div>}
              {open.cancelledReason && <div><span className="text-slate-400">Cancelled:</span> {open.cancelledReason}</div>}
            </div>

            {editable && (
              <Banner tone="info" title="Draft">
                This manifest is editable. Issue it to attest the consist — an issued manifest is immutable; corrections go through Amend.
              </Banner>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {(canWrite || canSign) && !["CLOSED", "CANCELLED", "SUPERSEDED"].includes(open.status) && (
              <Field label="Signatory name (bound to your verified identity)">
                <input className={inputCls} value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="e.g. J. Nkosi, Train Guard" />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              {canSign && open.status === "DRAFT" && (
                <button
                  className={btnPrimary}
                  disabled={busy !== null || !signName.trim()}
                  onClick={() => void act("Issue", () => issueTrainManifest(open.id, signName.trim()), "Manifest issued and frozen.")}
                >
                  {busy === "Issue" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Issue & freeze
                </button>
              )}
              {canSign && open.status === "ISSUED" && (
                <button
                  className={btnNeutral}
                  disabled={busy !== null}
                  onClick={() => void act("Amend", () => amendTrainManifest(open.id, "Amended from the Ops Console."), "New revision created as a draft.")}
                >
                  Amend → new revision
                </button>
              )}
              {canWrite && open.status === "ISSUED" && (
                <button className={btnPrimary} disabled={busy !== null} onClick={() => void act("Depart", () => departTrainManifest(open.id, signName.trim() || undefined))}>
                  Record departure
                </button>
              )}
              {canWrite && open.status === "DEPARTED" && (
                <button className={btnPrimary} disabled={busy !== null} onClick={() => void act("Arrive", () => arriveTrainManifest(open.id, signName.trim() || undefined))}>
                  Record arrival
                </button>
              )}
              {canSign && open.status === "ARRIVED" && (
                <button className={btnPrimary} disabled={busy !== null} onClick={() => void act("Close", () => closeTrainManifest(open.id, signName.trim() || undefined))}>
                  Close manifest
                </button>
              )}
              {canWrite && ["DRAFT", "ISSUED"].includes(open.status) && (
                <button className={btnDanger} disabled={busy !== null} onClick={() => setShowCancel(true)}>Cancel manifest</button>
              )}
              <button className={btnNeutral} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCancel && open && (
        <Modal title="Cancel manifest" onClose={() => setShowCancel(false)}>
          <Field label="Reason (required — recorded in the audit trail)">
            <textarea className={inputCls} rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          <div className="mt-4 flex gap-2">
            <button
              className={btnDanger}
              disabled={cancelReason.trim().length < 3 || busy !== null}
              onClick={() => {
                setShowCancel(false);
                void act("Cancel", () => cancelTrainManifest(open.id, cancelReason.trim()), "Manifest cancelled.");
                setCancelReason("");
              }}
            >
              Cancel manifest
            </button>
            <button className={btnNeutral} onClick={() => setShowCancel(false)}>Keep it</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
