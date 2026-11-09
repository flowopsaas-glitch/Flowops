import React, { useMemo, useState } from "react";
import { useToast } from "../components/toast-context";
import { printWaybillLabel } from "../lib/labelPrint";
import { api } from "../api/client";
import {
  FileText, Save, Upload, ScanLine, Sparkles, CreditCard, Truck, ClipboardList, Package, UserRound, Calculator, Trash2, Printer,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

// --- Types ---
type ChargeSide = "SENDER" | "RECEIVER";
type PaymentType = "PREPAID" | "COD";
type StepKey = "DETAILS" | "PARTIES" | "PARCELS" | "BILLING";

type ParcelLine = {
  id: string;
  qty: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type WaybillDraft = {
  waybillNo: string;
  orderDate: string;
  serviceLevel: "Same Day" | "Next Day" | "Economy" | "International";
  paymentType: PaymentType;
  codAmount: number;
  chargeSide: ChargeSide;
  clientContractCode: string;
  senderName: string;
  senderCompany: string;
  senderPhone: string;
  senderEmail: string;
  senderAddress1: string;
  senderCity: string;
  receiverName: string;
  receiverCompany: string;
  receiverPhone: string;
  receiverEmail: string;
  receiverAddress1: string;
  receiverCity: string;
  reference: string;
  notes: string;
  parcels: ParcelLine[];
};

// --- Helper Functions ---
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const todayISO = () => new Date().toISOString().split('T')[0];
const nnum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const moneyZAR = (v: unknown) => {
  const code = window.__FLOWOPS_CURRENCY__ ?? 'ZAR';
  const sym = { ZAR: 'R', USD: '$', GBP: '£', EUR: '€', ZIG: 'ZiG', KES: 'KSh', NGN: '₦', BWP: 'P' }[code] ?? code;
  return `${sym}${nnum(v).toFixed(2)}`;
};
const VOL_DIVISOR = 5000;

function volumetricKg(p: ParcelLine) {
  return (nnum(p.lengthCm) * nnum(p.widthCm) * nnum(p.heightCm)) / VOL_DIVISOR;
}

function chargeableKg(p: ParcelLine) {
  return Math.max(nnum(p.weightKg), volumetricKg(p));
}

function totals(parcels: ParcelLine[]) {
  return parcels.reduce((acc, p) => {
    const q = Math.max(1, Math.floor(nnum(p.qty)));
    acc.parcelsCount += q;
    acc.actualKg += nnum(p.weightKg) * q;
    acc.volKg += volumetricKg(p) * q;
    acc.chargeKg += chargeableKg(p) * q;
    return acc;
  }, { parcelsCount: 0, actualKg: 0, volKg: 0, chargeKg: 0 });
}

// --- Sub-Components (The missing pieces) ---

const Field = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-bold uppercase tracking-wider text-white/50">{label}</label>
    {children}
  </div>
);

const Tab = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center rounded-xl px-4 py-2 text-sm font-bold transition-all",
      active ? "bg-white/15 text-white shadow-lg" : "text-white/50 hover:bg-white/5 hover:text-white"
    )}
  >
    {children}
  </button>
);


const PillButton = ({ active, onClick, text, icon: Icon }: { active?: boolean; onClick?: () => void; text: string; icon?: LucideIcon }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition",
      active ? "border-sky-400/50 bg-sky-400/20 text-white" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
    )}
  >
    {Icon && <Icon className="h-3.5 w-3.5" />}
    {text}
  </button>
);

const NumInput = ({ value, onChange, placeholder }: { value?: number; onChange: (v: number) => void; placeholder?: string }) => (
  <input
    type="number"
    value={value || ""}
    onChange={(e) => onChange(nnum(e.target.value))}
    placeholder={placeholder}
    className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-sky-400/50"
  />
);

const PartyCard = ({ title, name, company, phone, email, address, city, onChange, payerActive }: { title: string; name?: string; company?: string; phone?: string; email?: string; address?: string; city?: string; onChange: (patch: Record<string, string>) => void; payerActive?: boolean }) => (
  <div className={cn(
    "rounded-2xl border p-5 transition-all",
    payerActive ? "border-sky-400/30 bg-sky-400/5 shadow-[0_0_20px_rgba(56,189,248,0.05)]" : "border-white/10 bg-white/5"
  )}>
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 font-extrabold text-white">
        <UserRound className={cn("h-5 w-5", payerActive ? "text-sky-400" : "text-white/40")} />
        {title} Details
      </div>
      {payerActive && <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">Payer Account</span>}
    </div>
    <div className="space-y-3">
      <input className={glassInput()} placeholder="Full Name" value={name} onChange={e => onChange({ name: e.target.value })} />
      <input className={glassInput()} placeholder="Company Name" value={company} onChange={e => onChange({ company: e.target.value })} />
      <input className={glassInput()} placeholder="Phone Number" value={phone} onChange={e => onChange({ phone: e.target.value })} />
      <input className={glassInput()} type="email" placeholder="Email (for tracking notifications)" value={email} onChange={e => onChange({ email: e.target.value })} />
      <input className={glassInput()} placeholder="Street Address" value={address} onChange={e => onChange({ address: e.target.value })} />
      <input className={glassInput()} placeholder="City" value={city} onChange={e => onChange({ city: e.target.value })} />
    </div>
  </div>
);

// --- Styling Hooks ---
const glassCard = (className?: string) => cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl fx-lift", className);
const glassInput = () => cn("w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-sky-400/30");
const glassSelect = () => cn("w-full rounded-xl border border-white/10 bg-[#1a1f2e] px-3 py-2 text-sm text-white outline-none");

// --- Main Component ---
export default function Waybills() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"CAPTURE" | "SCAN" | "UPLOAD">("CAPTURE");
  const [step, setStep] = useState<StepKey>("DETAILS");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ id: string; trackingNumber: string } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [draft, setDraft] = useState<WaybillDraft>(() => ({
    waybillNo: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
    orderDate: todayISO(),
    serviceLevel: "Next Day",
    paymentType: "PREPAID",
    codAmount: 0,
    chargeSide: "SENDER",
    clientContractCode: "",
    senderName: "", senderCompany: "", senderPhone: "", senderAddress1: "", senderCity: "", senderEmail: "",
    receiverName: "", receiverCompany: "", receiverPhone: "", receiverAddress1: "", receiverCity: "", receiverEmail: "",
    reference: "", notes: "",
    parcels: [{ id: uid(), qty: 1, weightKg: 2.5, lengthCm: 30, widthCm: 20, heightCm: 15 }],
  }));

  const t = useMemo(() => totals(draft.parcels), [draft.parcels]);

  // Logic for UI handling
  function set<K extends keyof WaybillDraft>(key: K, value: WaybillDraft[K]) { setDraft(d => ({ ...d, [key]: value })); }
  function setParcel(id: string, patch: Partial<ParcelLine>) {
    setDraft(d => ({ ...d, parcels: d.parcels.map(p => p.id === id ? { ...p, ...patch } : p) }));
  }
  const addParcel = () => setDraft(d => ({ ...d, parcels: [...d.parcels, { id: uid(), qty: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 }] }));
  const removeParcel = (id: string) => setDraft(d => ({ ...d, parcels: d.parcels.filter(p => p.id !== id) }));

  // ── Save Draft → POST /waybills ──────────────────────────────────────────
  async function saveDraft() {
    if (!draft.senderName.trim() || !draft.receiverName.trim()) {
      showToast("Please fill in Sender and Receiver names before saving.", "error");
      setStep("PARTIES");
      return;
    }
    setIsSaving(true);
    try {
      // Map UI field names to the backend Waybill schema
      const senderAddress = [draft.senderAddress1, draft.senderCity].filter(Boolean).join(", ");
      const recipientAddress = [draft.receiverAddress1, draft.receiverCity].filter(Boolean).join(", ");
      const totalAmount = parseFloat((t.chargeKg * 15.5).toFixed(2));

      const payload: Record<string, unknown> = {
        trackingNumber:   draft.waybillNo,
        senderName:       draft.senderName,
        senderPhone:      draft.senderPhone,
        senderEmail:      draft.senderEmail || undefined,
        senderAddress:    senderAddress || "N/A",
        recipientName:    draft.receiverName,
        recipientPhone:   draft.receiverPhone,
        recipientEmail:   draft.receiverEmail || undefined,
        recipientAddress: recipientAddress || "N/A",
        weight:           parseFloat(t.chargeKg.toFixed(3)),
        description:      draft.notes || undefined,
        totalAmount,
        status:           "PENDING",
      };
      if (draft.paymentType === "COD" && draft.codAmount > 0) {
        payload.codAmount = draft.codAmount;
      }

      const saved = await api.post("/waybills", payload);
      const savedWb = saved?.data ?? saved;
      showToast(`Waybill ${draft.waybillNo} saved successfully!`, "success");
      if (savedWb?.id) {
        setLastSaved({
          id: savedWb.id,
          trackingNumber: savedWb.trackingNumber || draft.waybillNo,
        });
      }
      setDraft({
        waybillNo: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
        orderDate: todayISO(),
        serviceLevel: "Next Day",
        paymentType: "PREPAID",
        codAmount: 0,
        chargeSide: "SENDER",
        clientContractCode: "",
        senderName: "", senderCompany: "", senderPhone: "", senderAddress1: "", senderCity: "", senderEmail: "",
        receiverName: "", receiverCompany: "", receiverPhone: "", receiverAddress1: "", receiverCity: "", receiverEmail: "",
        reference: "", notes: "",
        parcels: [{ id: uid(), qty: 1, weightKg: 2.5, lengthCm: 30, widthCm: 20, heightCm: 15 }],
      });
      setStep("DETAILS");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to save waybill";
      showToast(msg, "error");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Print Label → GET /waybills/:id/label (PDF, opens in new tab) ─────────
  async function printLabel(id: string) {
    setIsPrinting(true);
    try {
      await printWaybillLabel(id);
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to generate label";
      showToast(msg, "error");
    } finally {
      setIsPrinting(false);
    }
  }

  const stepItems = [
    { key: "DETAILS" as StepKey, label: "Details", icon: ClipboardList },
    { key: "PARTIES" as StepKey, label: "Parties", icon: UserRound },
    { key: "PARCELS" as StepKey, label: "Parcels", icon: Package },
    { key: "BILLING" as StepKey, label: "Billing & AI", icon: Calculator },
  ];

  return (
    <div className="relative min-h-full bg-[#060B1A] text-white font-sans">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Waybill <span className="text-sky-400">Capture</span></h1>
            <p className="text-sm text-white/50">Flowops Logistics Management System v2.0</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => setMode("SCAN")}><ScanLine className="mr-2 h-4 w-4"/> Scan</Button>
            {lastSaved && (
              <Button
                variant="outline"
                className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                disabled={isPrinting}
                onClick={() => void printLabel(lastSaved.id)}
                title={`Print label for ${lastSaved.trackingNumber}`}
              >
                <Printer className="mr-2 h-4 w-4"/>
                {isPrinting ? "Preparing…" : `Print Label (${lastSaved.trackingNumber})`}
              </Button>
            )}
            <Button className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50" disabled={isSaving} onClick={() => void saveDraft()}>
              <Save className="mr-2 h-4 w-4"/>
              {isSaving ? "Saving…" : "Save Draft"}
            </Button>
          </div>
        </div>

        {/* Mode Selector */}
        <div className={cn(glassCard(), "p-2 flex gap-2")}>
          <Tab active={mode === "CAPTURE"} onClick={() => setMode("CAPTURE")}><FileText className="mr-2 h-4 w-4"/> Manual</Tab>
          <Tab active={mode === "UPLOAD"} onClick={() => setMode("UPLOAD")}><Upload className="mr-2 h-4 w-4"/> Import</Tab>
        </div>

        {/* Step Navigation */}
        <div className="grid grid-cols-4 gap-3">
          {stepItems.map(s => (
            <button key={s.key} onClick={() => setStep(s.key)} className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all",
              step === s.key ? "border-sky-400/40 bg-sky-400/10" : "border-white/5 bg-white/5 opacity-50"
            )}>
              <s.icon className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-widest">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Dynamic Content */}
        {step === "DETAILS" && (
           <div className={cn(glassCard(), "p-6 grid md:grid-cols-3 gap-6")}>
              <Field label="Waybill Number"><input className={glassInput()} value={draft.waybillNo} onChange={e => set("waybillNo", e.target.value)}/></Field>
              <Field label="Order Date"><input type="date" className={glassInput()} value={draft.orderDate} onChange={e => set("orderDate", e.target.value)}/></Field>
              <Field label="Service Level">
                <select className={glassSelect()} value={draft.serviceLevel} onChange={e => set("serviceLevel", e.target.value as WaybillDraft["serviceLevel"])}>
                  <option>Next Day</option><option>Same Day</option><option>Economy</option>
                </select>
              </Field>
              <Field label="Payment Type">
                <div className="flex gap-2">
                  <PillButton text="Prepaid" icon={CreditCard} active={draft.paymentType === "PREPAID"} onClick={() => set("paymentType", "PREPAID")}/>
                  <PillButton text="Cash on Delivery" icon={Truck} active={draft.paymentType === "COD"} onClick={() => set("paymentType", "COD")}/>
                </div>
              </Field>
              {draft.paymentType === "COD" && (
                <Field label="COD Amount (R)">
                  <input type="number" className={glassInput()} placeholder="e.g. 3499.00" value={draft.codAmount || ""} onChange={e => set("codAmount", nnum(e.target.value))}/>
                </Field>
              )}
              <Field label="Payer Account"><div className="flex gap-2">
                <PillButton text="Sender" active={draft.chargeSide === "SENDER"} onClick={() => set("chargeSide", "SENDER")}/>
                <PillButton text="Receiver" active={draft.chargeSide === "RECEIVER"} onClick={() => set("chargeSide", "RECEIVER")}/>
              </div></Field>
              <Field label="Client Contract Code (optional)"><input className={glassInput()} placeholder="Leave blank if no contract" value={draft.clientContractCode} onChange={e => set("clientContractCode", e.target.value.toUpperCase())}/></Field>
              <Field label="Ref Number"><input className={glassInput()} placeholder="Your internal reference" value={draft.reference} onChange={e => set("reference", e.target.value)}/></Field>
           </div>
        )}

        {step === "PARTIES" && (
          <div className="grid md:grid-cols-2 gap-6">
            <PartyCard title="Sender" payerActive={draft.chargeSide === "SENDER"} name={draft.senderName} company={draft.senderCompany} phone={draft.senderPhone} email={draft.senderEmail} address={draft.senderAddress1} city={draft.senderCity} onChange={(p) => setDraft(d => ({...d, senderName: p.name ?? d.senderName, senderCity: p.city ?? d.senderCity, senderPhone: p.phone ?? d.senderPhone, senderEmail: p.email ?? d.senderEmail, senderAddress1: p.address ?? d.senderAddress1, senderCompany: p.company ?? d.senderCompany}))} />
            <PartyCard title="Receiver" payerActive={draft.chargeSide === "RECEIVER"} name={draft.receiverName} company={draft.receiverCompany} phone={draft.receiverPhone} email={draft.receiverEmail} address={draft.receiverAddress1} city={draft.receiverCity} onChange={(p) => setDraft(d => ({...d, receiverName: p.name ?? d.receiverName, receiverCity: p.city ?? d.receiverCity, receiverPhone: p.phone ?? d.receiverPhone, receiverEmail: p.email ?? d.receiverEmail, receiverAddress1: p.address ?? d.receiverAddress1, receiverCompany: p.company ?? d.receiverCompany}))} />
          </div>
        )}

        {step === "PARCELS" && (
          <div className={cn(glassCard(), "overflow-hidden")}>
            <table className="w-full text-left">
              <thead className="bg-white/5 text-[10px] font-black uppercase text-white/40">
                <tr>
                  <th className="p-4">Qty</th><th className="p-4">Weight(kg)</th><th className="p-4">L(cm)</th><th className="p-4">W(cm)</th><th className="p-4">H(cm)</th><th className="p-4">Charge(kg)</th><th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {draft.parcels.map(p => (
                  <tr key={p.id} className="group hover:bg-white/[0.02]">
                    <td className="p-3"><NumInput value={p.qty} onChange={(v: number) => setParcel(p.id, { qty: v })}/></td>
                    <td className="p-3"><NumInput value={p.weightKg} onChange={(v: number) => setParcel(p.id, { weightKg: v })}/></td>
                    <td className="p-3"><NumInput value={p.lengthCm} onChange={(v: number) => setParcel(p.id, { lengthCm: v })}/></td>
                    <td className="p-3"><NumInput value={p.widthCm} onChange={(v: number) => setParcel(p.id, { widthCm: v })}/></td>
                    <td className="p-3"><NumInput value={p.heightCm} onChange={(v: number) => setParcel(p.id, { heightCm: v })}/></td>
                    <td className="p-3 font-mono text-sky-400 font-bold">{chargeableKg(p).toFixed(2)}</td>
                    <td className="p-3"><button onClick={() => removeParcel(p.id)} className="text-white/20 hover:text-red-400"><Trash2 className="h-4 w-4"/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addParcel} className="w-full py-4 text-xs font-black uppercase text-sky-400 hover:bg-sky-400/5">+ Add Parcel Line</button>
          </div>
        )}

        {step === "BILLING" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className={cn(glassCard(), "md:col-span-2 p-6")}>
              <h3 className="text-lg font-bold mb-4">Cost Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-white/60"><span>Payment Type</span><span className="font-bold text-white">{draft.paymentType === "COD" ? "Cash on Delivery" : "Prepaid"}</span></div>
                {draft.paymentType === "COD" && draft.codAmount > 0 && (
                  <div className="flex justify-between text-sm text-white/60"><span>COD Amount (collect from recipient)</span><span className="font-bold text-amber-300">{moneyZAR(draft.codAmount)}</span></div>
                )}
                <div className="flex justify-between text-sm text-white/60"><span>Payer</span><span>{draft.chargeSide === "SENDER" ? "Sender pays" : "Receiver pays"}</span></div>
                <div className="flex justify-between text-sm text-white/60"><span>Total Parcels</span><span>{t.parcelsCount}</span></div>
                <div className="flex justify-between text-sm text-white/60"><span>Actual Weight</span><span>{t.actualKg.toFixed(2)} kg</span></div>
                <div className="flex justify-between text-sm text-white/60"><span>Volumetric Weight</span><span>{t.volKg.toFixed(2)} kg</span></div>
                <div className="flex justify-between text-sm text-white/60"><span>Chargeable Weight (higher of actual/vol)</span><span className="font-bold text-white">{t.chargeKg.toFixed(2)} kg</span></div>
                <div className="border-t border-white/10 pt-3 flex justify-between text-xl font-black text-sky-400">
                  <span>Delivery Charge</span><span>{moneyZAR(t.chargeKg * 15.5)}</span>
                </div>
                {draft.paymentType === "COD" && draft.codAmount > 0 && (
                  <div className="flex justify-between text-sm text-amber-300/70 border-t border-amber-400/10 pt-2"><span>+ COD to collect at door</span><span className="font-bold">{moneyZAR(draft.codAmount)}</span></div>
                )}
              </div>
              <div className="mt-4">
                <Field label="Notes / Special Instructions">
                  <input className={glassInput()} placeholder="e.g. Call before delivery, fragile, gate code 1234" value={draft.notes} onChange={e => set("notes", e.target.value)}/>
                </Field>
              </div>
            </div>
            <div className={cn(glassCard(), "p-6 border-amber-400/20 bg-amber-400/5")}>
              <div className="flex items-center gap-2 text-amber-400 font-bold mb-3"><Sparkles className="h-4 w-4"/> AI Auditor</div>
              <p className="text-xs leading-relaxed text-amber-200/70">
                {draft.paymentType === "COD" && draft.codAmount <= 0 && "⚠️ COD selected but no amount set. Driver won't know how much to collect."}
                {draft.paymentType === "COD" && draft.codAmount > 0 && `✅ COD ${moneyZAR(draft.codAmount)} will be collected from ${draft.receiverName || "recipient"} at delivery.`}
                {draft.paymentType === "PREPAID" && "✅ Prepaid — no cash collection at door. Invoice will be generated for the sender."}
                {!draft.receiverName && " ⚠️ Receiver name missing — go back to Parties tab."}
                {t.volKg > t.actualKg * 1.5 && " ℹ️ Volumetric weight exceeds actual by 50%+ — verify dimensions."}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
