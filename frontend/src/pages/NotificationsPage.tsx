import React from "react";
import {
  Bell,
  AlertTriangle,
  Sparkles,
  Mail,
  MessageCircle,
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

export default function NotificationsPage() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(90,70,160,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
            <Bell className="h-4 w-4" />
            Tenant Alert Center
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Notifications
          </h1>

          <p className="mt-2 max-w-4xl text-sm text-white/72">
            Central place for workflow alerts, invoice risk warnings, missing POD signals,
            communication activity, and AI-detected tenant exceptions.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card
            title="Workflow Alerts"
            desc="Operational updates that need attention from tenant users."
            icon={Bell}
          />
          <Card
            title="Risk Warnings"
            desc="Commercial or delivery issues that could affect billing or service quality."
            icon={AlertTriangle}
          />
          <Card
            title="AI Signals"
            desc="Machine-detected exceptions and quality flags across workflows."
            icon={Sparkles}
          />
          <Card
            title="Communication Alerts"
            desc="New inbox or WhatsApp activity routed into tenant operations."
            icon={Mail}
          />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <MessageCircle className="h-5 w-5" />
            Next upgrade
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              "Live tenant alert feed",
              "Unread notification states",
              "Priority-based alert ranking",
              "Driver and POD warnings",
              "Invoice and debt alerts",
              "AI issue escalation",
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
