import React, { useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import { api } from "../api/client";
import BarcodeQrScanner from "../components/BarcodeQrScanner";

type Captured = {
  waybillNumber: string;
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  totalAmount?: number;
  weight?: number;
  status?: string;
  scanImageUrl?: string;
  description?: string;
};

function inputBase() {
  return "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400";
}

function pill(cls: string) {
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`;
}

function normalizeText(s: string) {
  return s.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function blockAfter(text: string, labels: string[], lines: number) {
  const lower = text.toLowerCase();
  for (const lab of labels) {
    const idx = lower.indexOf(lab.toLowerCase());
    if (idx >= 0) {
      const after = text.slice(idx + lab.length);
      const chunk = after.split("\n").slice(0, lines).join("\n").trim();
      return chunk || null;
    }
  }
  return null;
}

function parsePartyBlock(block: string) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);

  const phone =
    lines.join(" ").match(/(\+?\d[\d\s()-]{7,}\d)/)?.[1]?.trim() || "";

  const name = lines[0] || "";
  const address = lines.slice(1).join(", ");

  return { name, phone, address };
}

// ✅ We treat barcode/QR as “source of truth” for waybill #
function extractWaybillNumberFromCode(raw: string) {
  const t = (raw || "").trim();

  // common cases:
  // - just the number
  // - "WB:1234567"
  // - URL containing ?waybill=123
  const direct = t.match(/\b([0-9]{7,14})\b/)?.[1];
  if (direct) return direct;

  const wb = t.match(/\bWB[:# ]*([A-Z0-9-]{6,})\b/i)?.[1];
  if (wb) return wb;

  const urlParam = t.match(/[?&](waybill|wb|waybillNumber)=([^&]+)/i)?.[2];
  if (urlParam) return decodeURIComponent(urlParam);

  return t;
}

function parseWaybillText(raw: string): { data: Partial<Captured>; hints: string[] } {
  const text = normalizeText(raw);
  const hints: string[] = [];
  const data: Partial<Captured> = {};

  const cust =
    text.match(/\bCustomer\s*[:#]?\s*([A-Za-z0-9 .,'&-]{2,})\b/i)?.[1] ||
    text.match(/\bBill\s*To\s*[:#]?\s*([A-Za-z0-9 .,'&-]{2,})\b/i)?.[1];

  if (cust) data.senderName = cust.trim();  // map detected "customer" to senderName
  else hints.push("Sender name not detected — type it in.");

  // Ignore origin/destination codes and type flags — not on Waybill model
  const pickUpBlock = blockAfter(text, ["Pick Up From", "Pickup From", "Collect From"], 6);
  const deliverBlock = blockAfter(text, ["Deliver To", "Delivery To", "Ship To"], 6);

  if (pickUpBlock) {
    const p = parsePartyBlock(pickUpBlock);
    data.senderName = p.name;
    data.senderPhone = p.phone;
    data.senderAddress = p.address;
  }

  if (deliverBlock) {
    const r = parsePartyBlock(deliverBlock);
    data.recipientName = r.name;
    data.recipientPhone = r.phone;
    data.recipientAddress = r.address;
  }

  const charges = text.match(/\bCharges?\s*[:R$]?\s*([0-9]+(\.[0-9]{1,2})?)\b/i)?.[1];
  if (charges) data.totalAmount = Number(charges);

  const status =
    text.match(/\bStatus\s*[:#]?\s*(Delivered|Pending|In Transit|Collected|Exception)\b/i)?.[1] ||
    (/\bDelivered\b/i.test(text) ? "DELIVERED" : undefined);
  if (status) data.status = status.toUpperCase();

  return { data, hints };
}

async function saveWaybill(payload: Captured) {
  return api.post("/waybills", {
    trackingNumber: payload.waybillNumber || undefined,
    senderName:        payload.senderName,
    senderPhone:       payload.senderPhone,
    senderAddress:     payload.senderAddress,
    recipientName:     payload.recipientName,
    recipientPhone:    payload.recipientPhone,
    recipientAddress:  payload.recipientAddress,
    totalAmount:       payload.totalAmount ?? 0,
    weight:            payload.weight ?? 0,
    status:            payload.status || "PENDING",
    description:       payload.description,
  });
}

export default function WaybillCapture() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>("");
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrBusy, setOcrBusy] = useState(false);

  const [hints, setHints] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<Captured>({
    waybillNumber: "",
    senderName: "",
    senderPhone: "",
    senderAddress: "",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    totalAmount: 0,
    weight: 0,
    status: "PENDING",
  });

  const quality = useMemo(() => {
    let s = 0;
    if (form.waybillNumber?.trim()) s += 30;
    if (form.senderName?.trim() || form.senderAddress?.trim()) s += 20;
    if (form.recipientName?.trim()) s += 20;
    if (form.recipientAddress?.trim()) s += 15;
    if ((form.totalAmount ?? 0) > 0) s += 15;
    return Math.max(0, Math.min(100, s));
  }, [form]);

  function onCodeDetected(raw: string) {
    const wb = extractWaybillNumberFromCode(raw);
    setForm((f) => ({ ...f, waybillNumber: wb }));
    setSavedMsg(null);
    setErr(null);
  }

  async function onPickFile(file: File | null) {
    setErr(null);
    setSavedMsg(null);
    setHints([]);
    setOcrText("");
    setOcrProgress(0);

    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setImgUrl(localUrl);
    setForm((f) => ({ ...f, scanImageUrl: localUrl }));

    // OCR for remaining fields (barcode already handles waybill #)
    setOcrBusy(true);
    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result?.data?.text || "";
      setOcrText(text);

      const parsed = parseWaybillText(text);
      setHints(parsed.hints);

      setForm((f) => ({
        ...f,
        ...parsed.data,
        waybillNumber: f.waybillNumber?.trim() ? f.waybillNumber : (parsed.data as any).waybillNumber || "",
      }));
    } catch (e: any) {
      setErr(e?.message || "OCR failed.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function save() {
    setErr(null);
    setSavedMsg(null);

    if (!form.waybillNumber?.trim()) return setErr("Waybill number is required (scan barcode/QR or type it).");
    if (!form.recipientName?.trim() && !form.recipientAddress?.trim()) return setErr("Recipient name or address is required.");

    setSaving(true);
    try {
      await saveWaybill(form);
      setSavedMsg("Saved ✅ and queued for invoicing (UNBILLED).");
      setForm({
        waybillNumber: "",
        senderName: "",
        senderPhone: "",
        senderAddress: "",
        recipientName: "",
        recipientPhone: "",
        recipientAddress: "",
        totalAmount: 0,
        weight: 0,
        status: "PENDING",
      });
      setImgUrl(null);
      setOcrText("");
      setHints([]);
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
          <h1 className="text-2xl font-semibold text-slate-900">Waybill Scan Capture (Barcode-first)</h1>
          <p className="text-sm text-slate-600">
            Scan barcode/QR for perfect Waybill # → OCR fills the rest → Save queues it for billing.
          </p>
        </div>

        <span className={quality >= 85 ? pill("bg-emerald-100 text-emerald-700") : quality >= 60 ? pill("bg-amber-100 text-amber-800") : pill("bg-red-100 text-red-700")}>
          Capture Quality {quality}/100
        </span>
      </div>

      <BarcodeQrScanner onDetected={onCodeDetected} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Upload Waybill Image (for OCR)</div>
          <div className="mt-2 text-xs text-slate-500">
            Barcode handles the number. Image OCR fills customer, addresses, charges, etc.
          </div>

          <input
            type="file"
            accept="image/*"
            className="mt-3 block w-full text-sm"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
          />

          {ocrBusy ? (
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-900">Extracting fields…</div>
              <div className="mt-2 text-xs text-slate-600">OCR: {ocrProgress}%</div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-slate-900" style={{ width: `${ocrProgress}%` }} />
              </div>
            </div>
          ) : null}

          {imgUrl ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-500">Preview</div>
              <img src={imgUrl} alt="Waybill scan" className="mt-2 rounded-xl border border-slate-200 w-full" />
            </div>
          ) : null}

          {hints.length ? (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-sm font-semibold text-amber-900">Capture hints</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                {hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {ocrText ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">OCR text (debug)</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-[260px] overflow-auto">
                {ocrText}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Captured Fields</div>

          {err ? (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {err}
            </div>
          ) : null}

          {savedMsg ? (
            <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              {savedMsg}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-500">Waybill # *</div>
              <input className={inputBase()} value={form.waybillNumber} onChange={(e) => setForm((f) => ({ ...f, waybillNumber: e.target.value }))} />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Status</div>
              <select className={inputBase()} value={form.status || "PENDING"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="PENDING">PENDING</option>
                <option value="COLLECTED">COLLECTED</option>
                <option value="IN_TRANSIT">IN_TRANSIT</option>
                <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="FAILED_DELIVERY">FAILED_DELIVERY</option>
                <option value="RETURNED">RETURNED</option>
              </select>
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
              <div className="text-xs font-semibold text-slate-500">Sender / Pickup Address</div>
              <input className={inputBase()} value={form.senderAddress || ""} onChange={(e) => setForm((f) => ({ ...f, senderAddress: e.target.value }))} />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Recipient Name *</div>
              <input className={inputBase()} value={form.recipientName || ""} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Recipient Phone</div>
              <input className={inputBase()} value={form.recipientPhone || ""} onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-500">Delivery Address</div>
              <input className={inputBase()} value={form.recipientAddress || ""} onChange={(e) => setForm((f) => ({ ...f, recipientAddress: e.target.value }))} />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Total Amount (ZAR)</div>
              <input className={inputBase()} value={String(form.totalAmount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, totalAmount: Number(e.target.value || 0) }))} />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Weight (kg)</div>
              <input className={inputBase()} value={String(form.weight ?? 0)} onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value || 0) }))} />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-500">Description / Notes</div>
              <input className={inputBase()} value={form.description || ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            <b>Why this crushes competitors:</b> barcode gives instant perfect Waybill #, OCR fills the rest, billing queue is automatic.
          </div>
        </div>
      </div>
    </div>
  );
}
