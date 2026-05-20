import React from "react";
import { Route as RouteIcon, MapPinned, Clock3, Sparkles } from "lucide-react";

export default function Routes() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <Hero
          icon={RouteIcon}
          title="Routes"
          subtitle="Control route planning, route visibility, and future optimization logic."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Planned Routes" value="24" icon={MapPinned} />
          <Card title="Delayed Corridors" value="3" icon={Clock3} />
          <Card title="AI Suggestions" value="11" icon={Sparkles} />
        </div>

        <Panel
          title="Route intelligence placeholder"
          body="This page is ready to evolve into route sequencing, corridor planning, congestion risk scoring, and route optimization workflows."
        />
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
    <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
        <Icon className="h-4 w-4" />
        Route engine
      </div>
      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{props.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/72">{props.subtitle}</p>
    </div>
  );
}

function Card(props: {
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

function Panel(props: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
      <div className="text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-white/72">{props.body}</div>
    </div>
  );
}
