import React, { useEffect, useState } from "react";
import { formatMoney } from "../../lib/currency";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  CreditCard,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api/client";
const tenantCurrency = () => (window as any).__FLOWOPS_CURRENCY__ ?? 'ZAR';

type VerifyResult = {
  success: boolean;
  reference?: string;
  amount?: number;
  currency?: string;
  planName?: string;
  customerEmail?: string;
  paidAt?: string;
  message?: string;
  status?: string;
};

/**
 * /billing/callback — Paystack redirects here after payment.
 *
 * Query params from Paystack:
 *   ?trxref=FO-SUB-XXXXXXXX&reference=FO-SUB-XXXXXXXX
 *
 * Flow:
 *   1. Extract reference from URL
 *   2. Call GET /paystack/verify-subscription/:reference
 *   3. Show success (plan upgraded) or failure (retry prompt)
 */
export default function BillingCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reference = params.get("reference") || params.get("trxref") || "";

  useEffect(() => {
    if (!reference) {
      setError("No payment reference found. Please try upgrading again.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res: any = await api.get(`/paystack/verify-subscription/${reference}`);
        const data = res?.data ?? res;
        setResult(data);
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Could not verify your payment. Please contact support."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [reference]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 text-sky-400 animate-spin mx-auto" />
          <h2 className="text-xl font-bold text-white">Verifying your payment...</h2>
          <p className="text-white/50 text-sm">This will only take a moment.</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6">
        <div className="max-w-md w-full rounded-[28px] border border-rose-500/30 bg-rose-500/8 p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          <XCircle className="h-14 w-14 text-rose-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-2">Verification Failed</h2>
          <p className="text-white/60 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate("/billing/plans")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white/15 transition"
          >
            <ArrowRight className="h-4 w-4" />
            Back to Billing
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (result?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_32%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6">
        <div className="max-w-lg w-full rounded-[28px] border border-emerald-500/30 bg-emerald-500/8 p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          {/* Animated checkmark */}
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500/30 ring-2 ring-emerald-400/40">
              <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            </div>
          </div>

          <h2 className="text-3xl font-black text-white mb-2">Payment Successful!</h2>
          <p className="text-emerald-200/80 text-base mb-6">
            Your subscription is now active. Welcome to FlowOps{" "}
            <span className="font-bold text-emerald-200">
              {result.planName || "Professional"}
            </span>
            !
          </p>

          {/* Payment details card */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 mb-6 text-left">
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">Plan</span>
                <span className="font-bold text-white">
                  {result.planName || "Professional"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Amount</span>
                <span className="font-bold text-white">
                  {formatMoney(result.amount ?? 0, tenantCurrency())} / month
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Reference</span>
                <span className="font-mono text-xs text-white/60">{result.reference}</span>
              </div>
              {result.customerEmail && (
                <div className="flex justify-between">
                  <span className="text-white/50">Email</span>
                  <span className="text-white/70">{result.customerEmail}</span>
                </div>
              )}
            </div>
          </div>

          {/* What's unlocked */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                What you've unlocked
              </span>
            </div>
            <ul className="space-y-1.5 text-sm text-white/70">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Unlimited waybills &amp; shipments
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> 25 drivers + 50 team members
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> AI Control Tower + Route Optimization
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> WhatsApp notifications + COD management
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Priority support
              </li>
            </ul>
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-white hover:bg-emerald-600 transition shadow-lg shadow-emerald-500/20"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Failed payment ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6">
      <div className="max-w-md w-full rounded-[28px] border border-amber-500/30 bg-amber-500/8 p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
        <XCircle className="h-14 w-14 text-amber-400 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-white mb-2">Payment Not Completed</h2>
        <p className="text-white/60 text-sm mb-2">
          {result?.message || "Your payment was not successful."}
        </p>
        <p className="text-white/40 text-xs mb-6">
          Reference: {reference}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate("/billing/plans")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15 transition"
          >
            <CreditCard className="h-4 w-4" />
            Try Again
          </button>
          <button
            onClick={() => {
              const msg = encodeURIComponent(
                `Hi! Payment reference ${reference} was not successful. Can you help?`
              );
              window.open(`https://wa.me/27606592875?text=${msg}`, "_blank");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
