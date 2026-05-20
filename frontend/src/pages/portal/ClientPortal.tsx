import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Link as LinkIcon,
  Package,
  Search,
  ClipboardList,
  Shield,
  Sparkles,
} from "lucide-react";
import { CommandCenterHeader } from "../../components/premium/CommandCenterHeader";

export default function ClientPortal() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_35%),linear-gradient(180deg,#050a14_0%,#07111f_55%,#0c1829_100%)] p-6 text-white sm:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <CommandCenterHeader
          eyebrow="Client experience"
          title="Self-service portal"
          subtitle="Booking, tracking, and collections in one branded surface — aligned with how premium 3PL and courier SaaS products separate client-facing apps from internal dispatch."
          trustChips={["Branded tracking", "Role-ready", "Tenant-scoped"]}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              to="/track"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-110"
            >
              Open tracking
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-xs font-bold text-white/90 transition hover:bg-white/10"
            >
              Tenant sign in
            </Link>
          </div>
        </CommandCenterHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <PortalCard
            title="Book shipment"
            icon={Package}
            description="Structured intake with rate-card aware estimates and SLA hints."
            href="/collections"
          />
          <PortalCard
            title="Track shipment"
            icon={Search}
            description="Branded milestones, ETA windows, and proof-of-delivery readiness."
            href="/track"
            featured
          />
          <PortalCard
            title="Request collection"
            icon={ClipboardList}
            description="Schedule pickups with driver capacity signals from your ops workspace."
            href="/collections"
          />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10">
                <Shield className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  Enterprise trust
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/60">
                  Tenant-isolated data, audit-friendly POD, and communications hubs (WhatsApp &
                  email) behind the same auth model as your internal command center — no
                  duct-taped spreadsheets.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">
              <span className="rounded-full border border-white/10 px-3 py-1">ISO-ready workflows</span>
              <span className="rounded-full border border-white/10 px-3 py-1">Real-time dispatch</span>
              <span className="rounded-full border border-white/10 px-3 py-1">AI exception radar</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-center text-[11px] text-white/40">
          <LinkIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            <Link to="/login" className="text-sky-300 hover:underline">
              Sign in
            </Link>{" "}
            to configure branded links (Billing → Client portal links).
          </span>
        </div>
      </div>
    </div>
  );
}

function PortalCard(props: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  href: string;
  featured?: boolean;
}) {
  const Icon = props.icon;
  return (
    <Link
      to={props.href}
      className={`group block rounded-[26px] border p-6 transition ${
        props.featured
          ? "border-sky-400/35 bg-gradient-to-b from-sky-500/15 to-white/[0.04] shadow-[0_20px_60px_rgba(56,189,248,0.12)]"
          : "border-white/10 bg-white/[0.05] hover:border-white/20 hover:bg-white/[0.08]"
      } backdrop-blur-xl`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${
            props.featured
              ? "bg-sky-500/20 ring-sky-400/30"
              : "bg-white/10 ring-white/10"
          }`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-white/25 transition group-hover:text-white/80" />
      </div>
      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/65">{props.description}</p>
    </Link>
  );
}
