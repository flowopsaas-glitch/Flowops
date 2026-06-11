import React from "react";
import { Sparkles, Bell, MessageCircle, Zap } from "lucide-react";

export default function Automations() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.15),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            Intelligent workflows
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">AI Automations</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/72">
            Build future-ready alerts, escalation rules, message flows, and AI-triggered actions across operations, billing, and client experience.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <AutoCard title="Alert Rules" icon={Bell} />
          <AutoCard title="Message Flows" icon={MessageCircle} />
          <AutoCard title="Event Triggers" icon={Zap} />
          <AutoCard title="AI Actions" icon={Sparkles} />
        </div>
      </div>
    </div>
  );
}

function AutoCard(props: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-2 text-sm text-white/70">
        Placeholder area for automation configuration and future workflow orchestration.
      </div>
    </div>
  );
}
