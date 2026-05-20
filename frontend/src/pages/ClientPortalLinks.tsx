import { Link2, Copy, ExternalLink, Building2, ShieldCheck } from "lucide-react";
import { useToast } from "../components/ToastProvider";

type PortalRow = {
  id: string;
  client: string;
  portalUrl: string;
  status: "ACTIVE" | "DRAFT" | "DISABLED";
  contact: string;
};

const demoRows: PortalRow[] = [
  {
    id: "CPL-001",
    client: "GoGet Couriers",
    portalUrl: "https://portal.flowops.local/goget",
    status: "ACTIVE",
    contact: "ops@gogetcouriers.com",
  },
  {
    id: "CPL-002",
    client: "Budget Couriers",
    portalUrl: "https://portal.flowops.local/budget",
    status: "DRAFT",
    contact: "admin@budgetcouriers.com",
  },
  {
    id: "CPL-003",
    client: "Acme Corp",
    portalUrl: "https://portal.flowops.local/acme",
    status: "DISABLED",
    contact: "support@acme.com",
  },
];

function statusTone(status: PortalRow["status"]) {
  if (status === "ACTIVE") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30";
  if (status === "DRAFT") return "bg-amber-500/15 text-amber-300 border-amber-400/30";
  return "bg-slate-500/15 text-slate-300 border-slate-400/30";
}

function copyText(value: string, showToast: (message: string, type?: "success" | "error") => void) {
  try {
    navigator.clipboard.writeText(value);
    showToast("Portal link copied.", "success");
  } catch {
    showToast("Copy failed. Please copy manually.", "error");
  }
}

function StatCard(props: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200/60">
        {props.title}
      </div>
      <div className="mt-3 text-3xl font-black text-white">
        {props.value}
      </div>
      <div className="mt-2 text-sm text-white/60">
        {props.subtitle}
      </div>
    </div>
  );
}

export default function ClientPortalLinks() {
  const { showToast } = useToast();
  const activeCount = demoRows.filter((row) => row.status === "ACTIVE").length;
  const draftCount = demoRows.filter((row) => row.status === "DRAFT").length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1e3a8a_0%,#0f172a_38%,#020617_100%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
                <ShieldCheck className="h-4 w-4" />
                Billing access layer
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                Client Portal Links
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
                Manage tenant-safe client portal links for billing visibility, shared access,
                and customer-facing service workflows without exposing the hidden FlowOps owner layer.
              </p>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                title="Total Links"
                value={String(demoRows.length)}
                subtitle="Portal records in view"
              />
              <StatCard
                title="Active"
                value={String(activeCount)}
                subtitle="Ready for client use"
              />
              <StatCard
                title="Draft"
                value={String(draftCount)}
                subtitle="Awaiting final setup"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-sky-300" />
            <div>
              <div className="text-lg font-black text-white">Portal Access Registry</div>
              <div className="text-sm text-white/60">
                Safe placeholder page to restore build integrity and keep the billing route active.
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {demoRows.map((row) => (
              <div
                key={row.id}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-lg font-black text-white">
                        {row.client}
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${statusTone(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-white/60">
                      Record: {row.id}
                    </div>

                    <div className="mt-3 break-all text-sm text-sky-200">
                      {row.portalUrl}
                    </div>

                    <div className="mt-2 text-sm text-white/60">
                      Contact: {row.contact}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => copyText(row.portalUrl, showToast)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </button>

                    <a
                      href={row.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-500/20"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
            This is a temporary safe rebuild page.
            It restores the default export expected by <span className="font-bold text-white">App.tsx</span>
            and keeps the billing route alive while we continue wiring the real client portal links logic.
          </div>
        </div>
      </div>
    </div>
  );
}
