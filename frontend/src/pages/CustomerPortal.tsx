import { useState, useEffect, useCallback } from "react";
import { formatMoney } from "../lib/currency";
import { useParams } from "react-router-dom";
import {
  Package, Search, FileText, Truck, MapPin, Send,
  Loader2, CheckCircle2, AlertTriangle, Phone, Mail,
} from "lucide-react";
import { FLOWOPS_API_URL } from "../lib/env";
const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? 'ZAR';

type Branding = {
  name: string;
  logo: string;
  color: string;
  phone: string;
  email: string;
  whatsapp: string;
};

type Waybill = {
  trackingNumber: string;
  status: string;
  senderName: string;
  recipientName: string;
  collectedAt: string | null;
  deliveredAt: string | null;
  weight: number | null;
};

type Invoice = {
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string;
  paidDate: string | null;
};

type Tab = "track" | "invoices" | "book";


const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  COLLECTED: "bg-blue-500/20 text-blue-300",
  IN_TRANSIT: "bg-sky-500/20 text-sky-300",
  OUT_FOR_DELIVERY: "bg-indigo-500/20 text-indigo-300",
  DELIVERED: "bg-emerald-500/20 text-emerald-300",
  FAILED_DELIVERY: "bg-rose-500/20 text-rose-300",
  RETURNED: "bg-orange-500/20 text-orange-300",
  DRAFT: "bg-zinc-500/20 text-zinc-300",
  SENT: "bg-blue-500/20 text-blue-300",
  PAID: "bg-emerald-500/20 text-emerald-300",
  OVERDUE: "bg-rose-500/20 text-rose-300",
};

export default function CustomerPortal() {
  const { companyId } = useParams<{ companyId: string }>();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [brandingError, setBrandingError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("track");

  useEffect(() => {
    if (!companyId) return;
    fetch(`${FLOWOPS_API_URL}/portal/${companyId}/branding`)
      .then((r) => {
        if (!r.ok) throw new Error("Unable to load portal.");
        return r.json();
      })
      .then((d) => setBranding(d))
      .catch((e) => setBrandingError(e.message));
  }, [companyId]);

  const accent = branding?.color || "#3b82f6";


  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "track", label: "Track Shipments", icon: Package },
    { id: "invoices", label: "My Invoices", icon: FileText },
    { id: "book", label: "Book Pickup", icon: Truck },
  ];

  if (brandingError) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-8">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-8 text-center max-w-sm w-full">
          <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-4" />
          <p className="font-black text-white mb-2">Portal Unavailable</p>
          <p className="text-sm text-white/50">{brandingError}</p>
        </div>
      </div>
    );
  }

  if (!branding) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.logo && (
              <img src={branding.logo} alt={branding.name} className="h-9 w-9 rounded-xl object-contain" />
            )}
            <span className="text-xl font-black text-white">{branding.name}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40">
            {branding.phone && (
              <a href={`tel:${branding.phone}`} className="flex items-center gap-1 hover:text-white/70 transition">
                <Phone className="h-3 w-3" /> {branding.phone}
              </a>
            )}
            {branding.email && (
              <a href={`mailto:${branding.email}`} className="flex items-center gap-1 hover:text-white/70 transition">
                <Mail className="h-3 w-3" /> {branding.email}
              </a>
            )}
          </div>
        </div>
      </header>


      {/* Main content */}
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? "text-white shadow-lg"
                    : "bg-white/[0.03] border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
                }`}
                style={isActive ? { background: `${accent}22`, border: `1px solid ${accent}44`, color: accent } : undefined}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
          {activeTab === "track" && <TrackTab companyId={companyId!} accent={accent} />}
          {activeTab === "invoices" && <InvoicesTab companyId={companyId!} accent={accent} />}
          {activeTab === "book" && <BookPickupTab companyId={companyId!} accent={accent} />}
        </div>
      </div>
    </div>
  );
}


/* ─── Track Shipments Tab ─── */
function TrackTab({ companyId, accent }: { companyId: string; accent: string }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tracking, setTracking] = useState("");
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone && !email && !tracking) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (phone) params.set("phone", phone);
      if (email) params.set("email", email);
      if (tracking) params.set("tracking", tracking);
      const res = await fetch(`${FLOWOPS_API_URL}/portal/${companyId}/track?${params}`);
      if (!res.ok) throw new Error("Unable to fetch shipments.");
      const data = await res.json();
      setWaybills(data.waybills || []);
    } catch (err) {
      setError(err.message);
      setWaybills([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, phone, email, tracking]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-white mb-1">Track Shipments</h2>
        <p className="text-sm text-white/40">Search by phone, email, or tracking number</p>
      </div>
      <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking number"
            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="sm:col-span-3 rounded-2xl py-3 text-sm font-black text-white transition-colors flex items-center justify-center gap-2"
          style={{ background: accent }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {searched && !loading && !error && waybills.length === 0 && (
        <div className="text-center py-8 text-white/40 text-sm">
          No shipments found matching your search.
        </div>
      )}

      {waybills.length > 0 && (
        <div className="space-y-3">
          {waybills.map((wb) => (
            <div key={wb.trackingNumber} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-white font-mono">{wb.trackingNumber}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLORS[wb.status] || "bg-white/10 text-white/50"}`}>
                  {wb.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/50">
                <MapPin className="h-3 w-3" />
                <span>{wb.senderName}</span>
                <span className="text-white/20">→</span>
                <span>{wb.recipientName}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-white/30">
                {wb.collectedAt && <span>Collected: {new Date(wb.collectedAt).toLocaleDateString("en-ZA")}</span>}
                {wb.deliveredAt && <span>Delivered: {new Date(wb.deliveredAt).toLocaleDateString("en-ZA")}</span>}
                {wb.weight && <span>{wb.weight} kg</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ─── Invoices Tab ─── */
function InvoicesTab({ companyId, accent }: { companyId: string; accent: string }) {
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName && !email) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (clientName) params.set("clientName", clientName);
      if (email) params.set("email", email);
      const res = await fetch(`${FLOWOPS_API_URL}/portal/${companyId}/invoices?${params}`);
      if (!res.ok) throw new Error("Unable to fetch invoices.");
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, clientName, email]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-white mb-1">My Invoices</h2>
        <p className="text-sm text-white/40">Search by your name or email address</p>
      </div>
      <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client / company name"
            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="sm:col-span-2 rounded-2xl py-3 text-sm font-black text-white transition-colors flex items-center justify-center gap-2"
          style={{ background: accent }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search Invoices
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {searched && !loading && !error && invoices.length === 0 && (
        <div className="text-center py-8 text-white/40 text-sm">
          No invoices found matching your search.
        </div>
      )}

      {invoices.length > 0 && (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.invoiceNumber} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-black text-white font-mono">{inv.invoiceNumber}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLORS[inv.status] || "bg-white/10 text-white/50"}`}>
                  {inv.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/40">
                <span className="text-white font-bold text-base">
                  {formatMoney(inv.total, tenantCurrency())}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <span>Due: {new Date(inv.dueDate).toLocaleDateString("en-ZA")}</span>
                  {inv.paidDate && <span className="text-emerald-400">Paid: {new Date(inv.paidDate).toLocaleDateString("en-ZA")}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ─── Book Pickup Tab ─── */
function BookPickupTab({ companyId, accent }: { companyId: string; accent: string }) {
  const [form, setForm] = useState({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    pickupAddress: "",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName || !form.clientPhone || !form.pickupAddress || !form.recipientName || !form.recipientPhone || !form.recipientAddress) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${FLOWOPS_API_URL}/portal/${companyId}/book-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Unable to submit pickup request.");
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, form]);

  if (success) {
    return (
      <div className="text-center py-12 space-y-4">
        <CheckCircle2 className="h-14 w-14 mx-auto" style={{ color: accent }} />
        <h2 className="text-xl font-black text-white">Pickup Requested!</h2>
        <p className="text-sm text-white/50">
          Your collection request has been submitted. We'll be in touch shortly to confirm.
        </p>
        <button
          onClick={() => { setSuccess(false); setForm({ clientName: "", clientPhone: "", clientEmail: "", pickupAddress: "", recipientName: "", recipientPhone: "", recipientAddress: "", notes: "" }); }}
          className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm font-bold text-white/60 hover:text-white transition"
        >
          Book Another
        </button>
      </div>
    );
  }


  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-white mb-1">Book a Pickup</h2>
        <p className="text-sm text-white/40">Request a new collection from your address</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputField icon={<Send className="h-4 w-4" />} placeholder="Your Name *" value={form.clientName} onChange={update("clientName")} required />
          <InputField icon={<Phone className="h-4 w-4" />} placeholder="Your Phone *" value={form.clientPhone} onChange={update("clientPhone")} required />
          <InputField icon={<Mail className="h-4 w-4" />} placeholder="Your Email (optional)" value={form.clientEmail} onChange={update("clientEmail")} />
          <InputField icon={<MapPin className="h-4 w-4" />} placeholder="Pickup Address *" value={form.pickupAddress} onChange={update("pickupAddress")} required />
          <InputField icon={<Send className="h-4 w-4" />} placeholder="Recipient Name *" value={form.recipientName} onChange={update("recipientName")} required />
          <InputField icon={<Phone className="h-4 w-4" />} placeholder="Recipient Phone *" value={form.recipientPhone} onChange={update("recipientPhone")} required />
          <div className="sm:col-span-2">
            <InputField icon={<MapPin className="h-4 w-4" />} placeholder="Recipient Address *" value={form.recipientAddress} onChange={update("recipientAddress")} required />
          </div>
        </div>
        <div className="relative">
          <textarea
            value={form.notes}
            onChange={update("notes")}
            placeholder="Notes (optional)"
            rows={3}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-300 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl py-3.5 text-sm font-black text-white transition-colors flex items-center justify-center gap-2"
          style={{ background: accent }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          Request Pickup
        </button>
      </form>
    </div>
  );
}


/* ─── Shared input component ─── */
function InputField({
  icon,
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">{icon}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
      />
    </div>
  );
}
