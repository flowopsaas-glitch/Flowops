import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  MapPin,
  PackageSearch,
  Radio,
  ShieldCheck,
  Truck,
} from "lucide-react";
type StepState = "done" | "current" | "upcoming";

const STEPS: { key: string; label: string; detail: string }[] = [
  { key: "booked", label: "Booked", detail: "Carrier received instructions" },
  { key: "picked", label: "Collected", detail: "Picked up from shipper" },
  { key: "transit", label: "In transit", detail: "Linehaul / depo movement" },
  { key: "out", label: "Out for delivery", detail: "Final-mile dispatch" },
  { key: "pod", label: "Delivered", detail: "Proof captured" },
];

function stepVisual(status: StepState) {
  if (status === "done")
    return (
      <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden />
    );
  if (status === "current")
    return <Radio className="h-6 w-6 animate-pulse text-sky-400" aria-hidden />;
  return <Circle className="h-6 w-6 text-white/20" aria-hidden />;
}

export default function TrackShipment() {
  const { ref } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = ref || searchParams.get("wb") || "";
  const [query, setQuery] = useState(initial);

  useEffect(() => {
    const fromRoute = (ref || searchParams.get("wb") || "").trim();
    if (fromRoute) setQuery(fromRoute);
  }, [ref, searchParams]);

  const activeRef = useMemo(() => (query || "").trim(), [query]);

  const currentStepIndex = 2;

  const etaWindow = "Today · 14:10 – 16:40";

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = query.trim();
    if (!v) return;
    setSearchParams({ wb: v });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent),linear-gradient(180deg,#050a14_0%,#07111f_45%,#0a1628_100%)] text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/login"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition hover:bg-white/10"
          >
            FlowOps <span className="text-white/40">·</span> Tenant sign in
          </Link>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Encrypted tracking session
          </div>
        </div>

        <div className="fo-page-polish rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-10">
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-sky-400/90">
              Branded shipment tracking
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Track your delivery
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-white/65">
              Enterprise-grade visibility: standardized milestones, live ETA window, and
              audit-friendly status — the same narrative your clients expect from top-tier
              logistics portals.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <PackageSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Waybill or reference (e.g. CIT-482910)"
                className="w-full rounded-2xl border border-white/15 bg-[#050d18]/90 py-4 pl-12 pr-4 text-sm font-semibold text-white placeholder:text-white/35 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-4 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-sky-500/25 transition hover:brightness-110 active:scale-[0.98]"
            >
              Track <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {activeRef ? (
            <div className="mt-10 space-y-8 border-t border-white/10 pt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                    Reference
                  </div>
                  <div className="mt-1 font-mono text-xl font-black text-white">
                    {activeRef}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/60">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-sky-400" />
                      JHB → CPT linehaul
                    </span>
                    <span className="text-white/25">|</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-emerald-400" />
                      Service: Express deferred
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-4 text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/80">
                    ETA window
                  </div>
                  <div className="mt-1 text-lg font-black text-emerald-100">{etaWindow}</div>
                  <div className="mt-1 text-xs text-emerald-200/70">Based on live route model</div>
                </div>
              </div>

              <div>
                <div className="mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                  Milestones
                </div>
                <ol className="space-y-0">
                  {STEPS.map((step, i) => {
                    const status: StepState =
                      i < currentStepIndex
                        ? "done"
                        : i === currentStepIndex
                          ? "current"
                          : "upcoming";
                    return (
                      <li
                        key={step.key}
                        className="flex gap-4 border-l border-white/10 pl-2 sm:pl-4"
                      >
                        <div className="-ml-[9px] mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                          {stepVisual(status)}
                        </div>
                        <div className="pb-8 pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-white">{step.label}</span>
                            {status === "current" ? (
                              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-200">
                                Now
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-white/55">{step.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <p className="text-center text-xs text-white/45">
                Demo timeline — connect your TMS webhook to drive live status from FlowOps.
              </p>
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-white/45">
              Enter a waybill to preview the branded tracking experience.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
