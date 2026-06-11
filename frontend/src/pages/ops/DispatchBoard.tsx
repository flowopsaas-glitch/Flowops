import React from "react";
import { KanbanSquare, Truck, Route, Clock3, Users } from "lucide-react";

export default function DispatchBoard() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <Hero
          icon={KanbanSquare}
          title="Dispatch Board"
          subtitle="Live dispatch control for collections, deliveries, and driver assignments."
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="Unassigned" value="18" icon={Truck} />
          <Stat title="In Dispatch" value="42" icon={Route} />
          <Stat title="Delayed" value="7" icon={Clock3} />
          <Stat title="Active Drivers" value="29" icon={Users} />
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <Column
            title="Unassigned"
            items={[
              "Collection #2048 · Sandton",
              "Delivery #9012 · Midrand",
              "Collection #2055 · Germiston",
            ]}
          />
          <Column
            title="Assigned"
            items={[
              "Driver Sipho · 8 stops",
              "Driver Thabo · 6 stops",
              "Driver Naledi · 4 stops",
            ]}
          />
          <Column
            title="In Progress"
            items={[
              "Driver Musa · route live",
              "Driver Zanele · delivery cycle",
              "Driver Neo · collection run",
            ]}
          />
          <Column
            title="Exceptions"
            items={[
              "Late pickup risk",
              "Address mismatch flagged",
              "Client requested ETA update",
            ]}
            danger
          />
        </div>
      </div>
    </div>
  );
}

function Hero(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
        <Icon className="h-4 w-4" />
        FlowOps Operations
      </div>
      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{props.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/72">{props.subtitle}</p>
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
      <div className="flex items-start justify-between gap-3">
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

function Column(props: { title: string; items: string[]; danger?: boolean }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-2xl">
      <div className={props.danger ? "text-sm font-extrabold text-red-200" : "text-sm font-extrabold text-white"}>
        {props.title}
      </div>
      <div className="mt-4 space-y-3">
        {props.items.map((item) => (
          <div
            key={item}
            className={[
              "rounded-2xl border p-3 text-sm",
              props.danger
                ? "border-red-400/15 bg-red-500/10 text-red-100"
                : "border-white/10 bg-black/20 text-white/80",
            ].join(" ")}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
