import { useEffect, useState } from "react";
import { Link2, Copy, Check, ExternalLink, Package, MapPin, QrCode, Share2, Loader2,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../api/client";
import { FLOWOPS_HTTP_ORIGIN } from "../../lib/env";

/**
 * Client Portal Links — surfaces the tenant's shareable, customer-facing links:
 *  • Booking / self-service portal  →  /portal/:companyId  (already live, branded)
 *  • Public shipment tracking       →  /track
 * Admins copy or QR-share these with their clients so customers can self-serve
 * collections and track shipments without calling in. No new backend needed —
 * these public routes already exist; this page just packages + shares them.
 */

type Company = { id: string; name?: string | null };

function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }

// Free, dependency-free QR via a public image endpoint.
const qrSrc = (data: string, size = 180) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${encodeURIComponent(data)}`;

function LinkCard({
  icon: Icon,
  title,
  desc,
  url,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  url: string;
  accent: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text: desc, url }); } catch { /* cancelled */ }
    } else {
      void copy();
    }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${accent}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="mt-0.5 text-sm text-white/50">{desc}</p>

          {/* The link */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-white/30" />
            <span className="truncate text-sm text-white/70">{url}</span>
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
            >
              {copied ? <><Check className="h-4 w-4 text-emerald-300" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-200 hover:bg-sky-500/20"
            >
              <ExternalLink className="h-4 w-4" /> Open
            </a>
            <button
              onClick={share}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={() => setShowQr((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
            >
              <QrCode className="h-4 w-4" /> {showQr ? "Hide QR" : "QR code"}
            </button>
          </div>

          {showQr && (
            <div className="mt-4 inline-block rounded-2xl bg-white p-3">
              <img src={qrSrc(url)} alt={`QR code for ${title}`} width={180} height={180} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalLinks() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const c = unwrap<Company>(await api.get("/companies/my-company"));
        setCompany(c);
      } catch (e) {
        setError(e?.response?.data?.message ?? e?.message ?? "Could not load your company details.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const base = FLOWOPS_HTTP_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "");
  const portalUrl = company?.id ? `${base}/portal/${company.id}` : "";
  const trackUrl = `${base}/track`;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f,#0b1530)] p-6 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
            <Link2 className="h-3.5 w-3.5 text-sky-400" /> Client Portal Links
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Share your customer portal</h1>
          <p className="mt-1 text-sm text-white/50">
            Give your clients a branded link to book collections and track their shipments themselves — fewer
            "where's my parcel?" calls, and a professional experience for {company?.name ?? "your customers"}.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm font-semibold text-rose-200">{error}</div>
        ) : (
          <>
            <LinkCard
              icon={Package}
              title="Customer Booking Portal"
              desc="Your branded self-service portal — clients book pickups, track shipments and view their invoices."
              url={portalUrl}
              accent="bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30"
            />
            <LinkCard
              icon={MapPin}
              title="Public Shipment Tracking"
              desc="A no-login tracking page — share with anyone expecting a delivery. They enter a tracking number and see live status."
              url={trackUrl}
              accent="bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
            />

            {/* Tip */}
            <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-5 py-4 text-sm text-white/50">
              💡 <span className="font-semibold text-white/70">Tip:</span> Put the booking portal link on your website,
              email signature and WhatsApp business profile. Print the QR code on your invoices and vehicle branding so
              customers can book and track in one tap.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
