import React, { useMemo, useState } from "react";
import { getApiBaseUrl, getToken } from "../api/client";

type WaybillType = "COLLECTION" | "DELIVERY";

type WaybillPayload = {
  waybillNumber: string;
  type: WaybillType;

  customerName: string;
  customerNo?: string;

  origin?: string;
  destination?: string;

  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;

  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;

  charges?: number;
  costs?: number;
  status?: string;
};

function inputBase() {
  return "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400";
}

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return String(v);
}

// FREE “AI” suggestions: validate + completeness + anomalies
function aiAssist(w: WaybillPayload) {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!w.waybillNumber.trim()) warnings.push("Waybill number is missing.");
  if (!w.customerName.trim()) warnings.push("Customer name is missing.");

  if ((w.charges ?? 0) <= 0) suggestions.push("Charges are 0 — confirm if this is correct.");
  if ((w.costs ?? 0) < 0) warnings.push("Costs cannot be negative.");

  const hasSender = !!(w.senderAddress || "").trim();
  const hasReceiver = !!(w.receiverAddress || "").trim();
  if (!hasSender) suggestions.push("Add sender address for better POD + billing accuracy.");
  if (!hasReceiver) suggestions.push("Add receiver address for better delivery proof.");

  // phone format sanity
  const phoneish = (s?: string) => (s || "").replace(/[^\d+]/g, "");
  if (w.senderPhone && phoneish(w.senderPhone).length < 9) suggestions.push("Sender phone looks too short.");
  if (w.receiverPhone && phoneish(w.receiverPhone).length < 9) suggestions.push("Receiver phone looks too short.");

  // Simple “risk score” (FREE)
  let score = 0;
  if (w.waybillNumber.trim()) score += 20;
  if (w.customerName.trim()) score += 20;
  if ((w.senderAddress || "").trim()) score += 15;
  if ((w.receiverAddress || "").trim()) score += 15;
  if ((w.charges ?? 0) > 0) score += 10;
  if ((w.origin || "").trim() && (w.destination || "").trim()) score += 10;
  if ((w.senderPhone || "").trim()) score += 5;
  if ((w.receiverPhone || "").trim()) score += 5;

  return { warnings, suggestions, score: Math.min(100, score) };
}

async function createWaybill(payload: WaybillPayload) {
  const base = getApiBaseUrl();
  const token = getToken();

  const res = await fetch(`${base}/waybills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Save failed (${res.status}). ${t}`);
  }
  return res.json();
}

export default function Waybill() {
  const [form, setForm] = useState<WaybillPayload>({
    waybillNumber: "",
    type: "DELIVERY",
    customerName: "",
    customerNo: "",
    origin: "",
    destination: "",
    senderName: "",
    senderPhone: "",
    senderAddress: "",
    receiverName: "",
    receiverPhone: "",
    receiverAddress: "",
    charges: 0,
    costs: 0,
    status: "PENDING",
  });

  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ai = useMemo(() => aiAssist(form), [form]);

  async function save() {
    setErr(null);
    setOk(null);

    if (!form.waybillNumber.trim()) return setErr("Waybill number is required.");
    if (!form.customerName.trim()) return setErr("Customer name is required.");

    setSaving(true);
    try {
      await createWaybill({
        ...form,
        charges: Number(form.charges ?? 0),
        costs: Number(form.costs ?? 0),
      });

      setOk("Saved ✅ and queued for invoicing (UNBILLED).");
      setForm({
        waybillNumber: "",
        type: "DELIVERY",
        customerName: "",
        customerNo: "",
        origin: "",
        destination: "",
        senderName: "",
        senderPhone: "",
        senderAddress: "",
        receiverName: "",
        receiverPhone: "",
        receiverAddress: "",
        charges: 0,
        costs: 0,
        status: "PENDING",
      });
    } catch (e: any) {
      setErr(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Waybill Manual Capture</h1>
          <p className="text-sm text-slate-600">
            Fast operator entry with FREE AI checks. Save → automatically queues for billing later.
          </p>
        </div>

        <span
          className={[
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
            ai.score >= 80
              ? "bg-emerald-100 text-emerald-700"
              : ai.score >= 60
              ? "bg-amber-100 text-amber-800"
              : "bg-red-100 text-red-700",
          ].join(" ")}
        >
          Capture Quality {ai.score}/100
        </span>
      </div>

      {(err || ok) && (
        <div
          className={[
            "rounded-2xl border p-4 text-sm",
            err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
          ].join(" ")}
        >
          {err || ok}
        </div>
      )}

      {(ai.warnings.length || ai.suggestions.length) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">AI Assistant (FREE)</div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-600">Warnings</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-800 space-y-1">
                {ai.warnings.length ? ai.warnings.map((w) => <li key={w}>{w}</li>) : <li>None</li>}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-600">Suggestions</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-800 space-y-1">
                {ai.suggestions.length ? ai.suggestions.map((s) => <li key={s}>{s}</li>) : <li>None</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-500">Waybill # *</div>
            <input className={inputBase()} value={form.waybillNumber} onChange={(e) => setForm((f) => ({ ...f, waybillNumber: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Type</div>
            <select className={inputBase()} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as WaybillType }))}>
              <option value="COLLECTION">Collection</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-500">Customer Name *</div>
            <input className={inputBase()} value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Origin</div>
            <input className={inputBase()} value={form.origin || ""} onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Destination</div>
            <input className={inputBase()} value={form.destination || ""} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Sender Name</div>
            <input className={inputBase()} value={form.senderName || ""} onChange={(e) => setForm((f) => ({ ...f, senderName: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Sender Phone</div>
            <input className={inputBase()} value={form.senderPhone || ""} onChange={(e) => setForm((f) => ({ ...f, senderPhone: e.target.value }))} />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-500">Sender Address</div>
            <input className={inputBase()} value={form.senderAddress || ""} onChange={(e) => setForm((f) => ({ ...f, senderAddress: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Receiver Name</div>
            <input className={inputBase()} value={form.receiverName || ""} onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Receiver Phone</div>
            <input className={inputBase()} value={form.receiverPhone || ""} onChange={(e) => setForm((f) => ({ ...f, receiverPhone: e.target.value }))} />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-500">Receiver Address</div>
            <input className={inputBase()} value={form.receiverAddress || ""} onChange={(e) => setForm((f) => ({ ...f, receiverAddress: e.target.value }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Charges</div>
            <input className={inputBase()} value={money(form.charges)} onChange={(e) => setForm((f) => ({ ...f, charges: Number(e.target.value || 0) }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Costs</div>
            <input className={inputBase()} value={money(form.costs)} onChange={(e) => setForm((f) => ({ ...f, costs: Number(e.target.value || 0) }))} />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Status</div>
            <select className={inputBase()} value={form.status || "PENDING"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="PENDING">PENDING</option>
              <option value="COLLECTED">COLLECTED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="EXCEPTION">EXCEPTION</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              disabled={saving}
              onClick={save}
              className={[
                "w-full rounded-xl px-4 py-2 text-sm font-semibold",
                saving ? "bg-slate-300 text-white" : "bg-slate-900 text-white hover:bg-slate-800",
              ].join(" ")}
            >
              {saving ? "Saving…" : "Save → Queue for Invoice"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <b>Why this beats competitors:</b> every manual waybill becomes a billing-ready record automatically (UNBILLED queue).
      </div>
    </div>
  );
}
