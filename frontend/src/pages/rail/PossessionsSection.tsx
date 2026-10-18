import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import {
  cancelPossession, completePossession, createPossession, getPossessionConflicts, listPossessions,
  type ConflictScan, type PossessionKind, type PossessionWindow,
} from "../../api/railChangeApi";
import { getCorridors, type Corridor } from "../../api/railSlotApi";
import {
  POSSESSION_KIND_LABEL, POSSESSION_STATUS_LABEL, formatDateTime, localInputToIso, possessionActions, possessionStatusTone,
} from "../../lib/railChange";
import { useToast } from "../../components/ToastProvider";
import PossessionConflictBanner from "./PossessionConflictBanner";
import { Field, Modal, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

export default function PossessionsSection({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<PossessionWindow[]>([]);
  const [scan, setScan] = useState<ConflictScan | null>(null);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [corridorsError, setCorridorsError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [windowsResult, scanResult, corridorsResult] = await Promise.allSettled([
      listPossessions(), getPossessionConflicts(), getCorridors(),
    ]);
    const message = (reason: unknown) => String((reason as Error)?.message ?? reason);
    if (windowsResult.status === "fulfilled") {
      setRows(windowsResult.value);
      setWindowsError(null);
    } else {
      setRows([]);
      setWindowsError(message(windowsResult.reason));
    }
    if (scanResult.status === "fulfilled") {
      setScan(scanResult.value);
      setScanError(null);
    } else {
      setScan(null);
      setScanError(message(scanResult.reason));
    }
    if (corridorsResult.status === "fulfilled") {
      setCorridors(corridorsResult.value);
      setCorridorsError(null);
    } else {
      setCorridors([]);
      setCorridorsError(message(corridorsResult.reason));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const corridorName = (code: string) => corridors.find((c) => c.code === code)?.name ?? code;

  async function act(w: PossessionWindow, action: "complete" | "cancel") {
    if (action === "cancel" && !window.confirm(`Cancel the possession window “${w.title}”?`)) return;
    setBusy(`${w.id}:${action}`);
    try {
      await (action === "cancel" ? cancelPossession(w.id) : completePossession(w.id));
      showToast(`“${w.title}” ${action === "cancel" ? "cancelled" : "completed"}`, "success");
      await load();
    } catch (e) { showToast((e as Error)?.message || "Action failed", "error"); } finally { setBusy(""); }
  }

  return (
    <Section
      title="Possession windows"
      right={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnNeutral} onClick={() => void load()} disabled={loading} aria-label="Refresh possession data">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {canWrite && <button type="button" className={btnPrimary} onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> Record possession window</button>}
        </div>
      }
    >
      {windowsError && (
        <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
          Possession-window records unavailable: {windowsError}. An empty list is not implied.
        </div>
      )}
      {scanError ? (
        <div role="alert" className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Possession conflict scan unavailable: {scanError}. No all-clear status is implied.
        </div>
      ) : !loading && scan === null ? (
        <div role="note" className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Possession conflict scan unavailable. No all-clear status is implied.
        </div>
      ) : <PossessionConflictBanner scan={scan} />}
      {corridorsError && (
        <div role="alert" className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Corridor reference data unavailable: {corridorsError}. Corridor labels and new-window choices may be incomplete.
        </div>
      )}
      <div data-testid="possession-windows" className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-slate-400">
            <tr><th className="px-3 py-2">Window</th><th className="px-3 py-2">Corridor</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">From → until</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500"><div role="status"><Loader2 className="mx-auto h-5 w-5 animate-spin" />Loading possession windows…</div></td></tr>}
            {!loading && !windowsError && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No possession windows recorded.</td></tr>}
            {!loading && rows.map((w) => (
              <tr key={w.id} className="align-top">
                <td className="px-3 py-2 text-slate-200"><span className="font-semibold">{w.title}</span>{w.location && <div className="text-[10px] text-slate-500">{w.location}</div>}{w.imReference && <div className="text-[10px] text-slate-500">IM ref {w.imReference}</div>}</td>
                <td className="px-3 py-2 text-slate-300">{corridorName(w.corridorCode)}<div className="font-mono text-[10px] text-slate-500">{w.corridorCode}</div></td>
                <td className="px-3 py-2 text-slate-300">{POSSESSION_KIND_LABEL[w.kind]}{w.locked && <div><Pill tone="danger" title={w.lockedFrom ? `Locked from ${formatDateTime(w.lockedFrom)}` : "Locked"}>Locked</Pill></div>}</td>
                <td className="px-3 py-2 text-slate-300">{formatDateTime(w.startsAt)} → {formatDateTime(w.endsAt)}</td>
                <td className="px-3 py-2"><Pill tone={possessionStatusTone(w.status)}>{POSSESSION_STATUS_LABEL[w.status]}</Pill></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    {possessionActions(w, canWrite).map((a) => (
                      <button key={a} type="button" className={btnNeutral} disabled={busy === `${w.id}:${a}`} onClick={() => void act(w, a)}>{a === "complete" ? "Mark completed" : "Cancel"}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showNew && canWrite && (
        <PossessionModal
          corridors={corridors} onClose={() => setShowNew(false)}
          onCreated={(overlaps) => {
            setShowNew(false);
            showToast(overlaps > 0 ? `Possession window recorded — it overlaps ${overlaps} consignment${overlaps === 1 ? "" : "s"}` : "Possession window recorded", overlaps > 0 ? "info" : "success");
            void load();
          }}
        />
      )}
    </Section>
  );
}

function PossessionModal({ corridors, onClose, onCreated }: { corridors: Corridor[]; onClose: () => void; onCreated: (overlaps: number) => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState({ corridorCode: "", kind: "ANNUAL_PLAN" as PossessionKind, title: "", startsAt: "", endsAt: "", location: "", imReference: "", noticeGivenAt: "", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const startsAt = localInputToIso(f.startsAt);
  const endsAt = localInputToIso(f.endsAt);
  const ordered = !!startsAt && !!endsAt && new Date(endsAt).getTime() > new Date(startsAt).getTime();
  const ok = !!f.corridorCode && f.title.trim().length >= 3 && ordered;

  async function submit() {
    if (!ok || !startsAt || !endsAt) return;
    setBusy(true);
    try {
      const res = await createPossession({
        corridorCode: f.corridorCode, kind: f.kind, title: f.title.trim(), startsAt, endsAt,
        ...(f.location.trim() ? { location: f.location.trim() } : {}), ...(f.imReference.trim() ? { imReference: f.imReference.trim() } : {}),
        ...(f.description.trim() ? { description: f.description.trim() } : {}), ...(localInputToIso(f.noticeGivenAt) ? { noticeGivenAt: localInputToIso(f.noticeGivenAt) } : {}),
      });
      onCreated(res.conflicts.length);
    } catch (e) { showToast((e as Error)?.message || "Could not record the possession window", "error"); } finally { setBusy(false); }
  }

  return (
    <Modal title="Record a possession window" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Corridor">
          <select className={inputCls} value={f.corridorCode} onChange={(e) => set({ corridorCode: e.target.value })}>
            <option value="">Select a corridor…</option>
            {corridors.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </select>
        </Field>
        <Field label="Kind">
          <select className={inputCls} value={f.kind} onChange={(e) => set({ kind: e.target.value as PossessionKind })}>
            {(Object.keys(POSSESSION_KIND_LABEL) as PossessionKind[]).map((k) => <option key={k} value={k}>{POSSESSION_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Title"><input className={inputCls} value={f.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Ore line re-sleepering km 120–140" /></Field></div>
        <Field label="Starts"><input type="datetime-local" className={inputCls} value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
        <Field label="Ends"><input type="datetime-local" className={inputCls} value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
        <Field label="Location (optional)"><input className={inputCls} value={f.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label="IM reference (optional)"><input className={inputCls} value={f.imReference} maxLength={120} onChange={(e) => set({ imReference: e.target.value })} /></Field>
        <Field label="Notice given (optional)"><input type="datetime-local" className={inputCls} value={f.noticeGivenAt} onChange={(e) => set({ noticeGivenAt: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Description (optional)"><textarea className={`${inputCls} min-h-[70px]`} value={f.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} /></Field></div>
      </div>
      {f.startsAt && f.endsAt && !ordered && <p role="alert" className="mt-2 text-xs text-rose-300">The window must end after it starts.</p>}
      {corridors.length === 0 && <p className="mt-2 text-xs text-amber-300">No corridors could be loaded, so a window cannot be recorded yet.</p>}
      <p className="mt-2 text-[11px] text-slate-500">Saving also checks the window against your active consignments on the same corridor; any overlap is reported straight away.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnNeutral} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!ok || busy} onClick={() => void submit()}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Record window</button>
      </div>
    </Modal>
  );
}
