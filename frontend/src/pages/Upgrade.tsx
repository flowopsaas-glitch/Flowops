import React from "react";
import { Lock, Sparkles, ArrowUpRight } from "lucide-react";

export default function Upgrade() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
            <Lock className="h-3.5 w-3.5" />
            Upgrade required
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
            Unlock more FlowOps power
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
            This tool is part of the larger FlowOps operating system. It can be
            enabled by package, feature flag, company setup, or enterprise access.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard
              title="Growth"
              subtitle="Operational scale"
              bullets={[
                "Better workflow visibility",
                "Team-level controls",
                "More advanced client tooling",
              ]}
            />
            <FeatureCard
              title="Pro"
              subtitle="Automation + intelligence"
              bullets={[
                "AI-assisted operations",
                "Advanced dispatch tooling",
                "Optimization features",
              ]}
              highlighted
            />
            <FeatureCard
              title="Enterprise"
              subtitle="Full platform power"
              bullets={[
                "Feature customization",
                "Role-based visibility",
                "Dedicated workflow controls",
              ]}
            />
          </div>

          <div className="mt-8 rounded-[24px] border border-cyan-400/15 bg-cyan-500/10 p-5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-cyan-100">
              <Sparkles className="h-4 w-4" />
              Why this matters
            </div>
            <p className="mt-2 text-sm leading-6 text-cyan-50/85">
              FlowOps is being built as a full master system. Companies can unlock
              only the tools they pay for, while you keep the whole platform ready
              for growth, upsells, enterprise deals, and custom access.
            </p>
          </div>

          <button
            type="button"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            <ArrowUpRight className="h-4 w-4" />
            Review package options
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureCard(props: {
  title: string;
  subtitle: string;
  bullets: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[24px] border p-5 backdrop-blur-xl",
        props.highlighted
          ? "border-blue-400/25 bg-blue-500/10 shadow-[0_0_24px_rgba(59,130,246,0.18)]"
          : "border-white/10 bg-white/6",
      ].join(" ")}
    >
      <div className="text-xl font-black text-white">{props.title}</div>
      <div className="mt-1 text-sm text-white/65">{props.subtitle}</div>

      <div className="mt-4 space-y-2">
        {props.bullets.map((bullet) => (
          <div key={bullet} className="rounded-2xl bg-black/20 px-3 py-2 text-sm text-white/78">
            {bullet}
          </div>
        ))}
      </div>
    </div>
  );
}
