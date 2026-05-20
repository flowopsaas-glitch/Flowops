import React from "react";
import { MapPinned, Wifi, Truck, Clock3 } from "lucide-react";

export default function LiveTracking() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <Hero />
        <div className="grid gap-4 md:grid-cols-4">
          <TrackCard title="Tracked Vehicles" value="29" icon={Truck} />
          <TrackCard title="Active Signals" value="27" icon={Wifi} />
          <TrackCard title="Late ETAs" value="5" icon={Clock3} />
          <TrackCard title="Tracked Zones" value="12" icon={MapPinned} />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
          <div className="text-lg font-extrabold text-white">Tracking map placeholder</div>
          <div className="mt-3 h-[380px] rounded-[22px] border border-dashed border-white/10 bg-black/20 grid place-items-center text-sm text-white/55">
            Live tracking map canvas goes here
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
        <MapPinned className="h-4 w-4" />
        Live movement view
      </div>
      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Live Tracking</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/72">
        Track fleet and shipment movement in one place, with future support for ETA intelligence and route event alerts.
      </p>
    </div>
  );
}

function TrackCard(props: {
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
