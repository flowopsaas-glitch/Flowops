import React from "react";
import { WalletCards, BadgePercent, FileText, Building2 } from "lucide-react";

export default function Contracts() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.14),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
            <WalletCards className="h-4 w-4" />
            Revenue controls
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Contracts</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/72">
            Manage contract logic, client billing rules, courier agreements, payer-side mapping, and rate structure control.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="Active Contracts" value="58" icon={FileText} />
          <Stat title="Client Agreements" value="33" icon={Building2} />
          <Stat title="Rate Profiles" value="21" icon={BadgePercent} />
          <Stat title="Contract Codes" value="14" icon={WalletCards} />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
          <div className="text-lg font-extrabold text-white">Contract engine placeholder</div>
          <div className="mt-2 text-sm leading-6 text-white/72">
            This page can evolve into prepaid, COD, client-side, courier-side, and payer-side contract management with billing intelligence.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat(props: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{props.title}</div>
          <div className="mt-3 text-3xl font-black text-white">{props.value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}
