import React from "react";
import { Users, Truck, BadgeCheck, Clock3 } from "lucide-react";

export default function Drivers() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.15),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
            <Users className="h-4 w-4" />
            Fleet workforce
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Drivers</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/72">
            Manage driver records, route assignment readiness, status, and future mobile activity links.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="Drivers" value="31" icon={Users} />
          <Stat title="On Route" value="22" icon={Truck} />
          <Stat title="Verified" value="29" icon={BadgeCheck} />
          <Stat title="Awaiting Action" value="4" icon={Clock3} />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
          <div className="text-lg font-extrabold text-white">Driver management placeholder</div>
          <div className="mt-2 text-sm leading-6 text-white/72">
            This page is ready for driver profiles, verification, availability, shift logic, collections assignment, and delivery execution.
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
