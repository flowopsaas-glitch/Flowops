import React from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Brain,
  Eye,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

function Card(props: {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-1 text-sm leading-relaxed text-white/65">{props.desc}</div>
    </div>
  );
}

export default function RisksExceptions() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(145,60,60,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
            <ShieldAlert className="h-4 w-4" />
            Risks & Exceptions
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Risks / Exceptions
          </h1>

          <p className="mt-2 max-w-4xl text-sm text-white/72">
            Central queue for high-risk operational and commercial exceptions, including
            missing evidence, abnormal invoice patterns, and AI-prioritized problem cases.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card
            title="Exception Queue"
            desc="See the most important operational and billing issues first."
            icon={ShieldAlert}
          />
          <Card
            title="Operational Risks"
            desc="Surface POD, dispatch, and collection-related workflow problems."
            icon={AlertTriangle}
          />
          <Card
            title="AI Prioritization"
            desc="Rank issues by confidence, risk, and probable business impact."
            icon={Brain}
          />
          <Card
            title="Human Review"
            desc="Keep people in control of final decisions and resolution."
            icon={Eye}
          />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="h-5 w-5" />
            Next upgrade
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              "High-risk workflow queue",
              "Invoice anomaly board",
              "Missing POD heatmap",
              "AI explainability notes",
              "Exception ownership",
              "Escalation workflow",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78"
              >
                <ArrowUpRight className="h-4 w-4 text-white/45" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
