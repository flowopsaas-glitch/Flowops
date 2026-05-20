import React from "react";
import {
  ScrollText,
  MessageCircleQuestion,
  Receipt,
  ClipboardCheck,
  ArrowUpRight,
  Search,
  Users,
  Mail,
  MessageCircle,
  ShieldAlert,
  Clock3,
  Sparkles,
  FileText,
} from "lucide-react";

function MetricCard(props: {
  title: string;
  value: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
            {props.title}
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-white">
            {props.value}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-white/62">
            {props.desc}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function QueueCard(props: {
  title: string;
  desc: string;
  count: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white/80">
          {props.count}
        </div>
      </div>

      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/65">{props.desc}</div>
    </div>
  );
}

function ListRow(props: {
  title: string;
  meta: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-white">{props.title}</div>
        <div className="mt-1 text-xs text-white/50">{props.meta}</div>
      </div>
      <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/78">
        {props.status}
      </div>
    </div>
  );
}

export default function ClientQueries() {
  const queues = [
    {
      title: "Open Queries",
      desc: "Track unresolved customer questions and support cases in one operational queue.",
      count: "28 open",
      icon: Search,
    },
    {
      title: "Delivery Questions",
      desc: "Handle ETA, parcel status, route delays, and delivery troubleshooting.",
      count: "12 active",
      icon: MessageCircleQuestion,
    },
    {
      title: "Invoice Disputes",
      desc: "Resolve billing, contract-code, surcharge, and invoice clarification issues.",
      count: "7 flagged",
      icon: Receipt,
    },
    {
      title: "POD Disputes",
      desc: "Manage proof-of-delivery disagreements and evidence follow-up workflow.",
      count: "5 urgent",
      icon: ClipboardCheck,
    },
  ];

  const recentItems = [
    {
      title: "Invoice mismatch on Q94 shipment batch",
      meta: "Budget Couriers • Invoice dispute • 14 min ago",
      status: "Needs review",
    },
    {
      title: "Customer asking for POD copy and signed evidence",
      meta: "GoGet Couriers • POD dispute • 27 min ago",
      status: "Awaiting POD",
    },
    {
      title: "ETA follow-up for delayed Polokwane route",
      meta: "J/D Fasteners • Delivery question • 41 min ago",
      status: "Dispatch update",
    },
    {
      title: "Waybill reference not matching client statement",
      meta: "Client finance desk • Billing query • 1 hr ago",
      status: "Investigating",
    },
  ];

  const nextUpgrades = [
    "Live open-query board linked to real messages",
    "Link each query to waybill, invoice, or collection",
    "Assign an owner and SLA clock to every case",
    "POD dispute evidence workflow with attachments",
    "AI categorization, routing, and severity scoring",
    "Escalation lane for high-risk client issues",
  ];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(86,124,255,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(64,196,255,0.10),transparent_22%),linear-gradient(180deg,#07111f_0%,#0b1530_52%,#0e1b3f_100%)] px-4 py-5 sm:px-6 xl:px-0">
      <div className="w-full max-w-[1820px] space-y-6">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <ScrollText className="h-4 w-4" />
                Client Support & Query Flow
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl xl:text-5xl">
                Client Queries Command Center
              </h1>

              <p className="mt-3 max-w-[1100px] text-sm leading-6 text-white/72 sm:text-[15px]">
                Centralized queue for tenant client delivery queries, POD disputes, invoice
                questions, ETA follow-ups, and support issues coming from WhatsApp, email,
                internal teams, and operational exceptions.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:w-[540px]">
              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Inbox sources
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <MessageCircle className="h-4 w-4 text-white/70" />
                  WhatsApp
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Mail className="h-4 w-4 text-white/70" />
                  Email
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Users className="h-4 w-4 text-white/70" />
                  Internal staff
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  SLA focus
                </div>
                <div className="mt-3 text-2xl font-black text-white">2h</div>
                <div className="mt-2 text-sm text-white/65">
                  Target first-response window for active customer issues.
                </div>
              </div>

              <div className="rounded-[22px] border border-sky-300/20 bg-sky-300/10 p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-100/85">
                  <Sparkles className="h-4 w-4" />
                  AI assist
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  Categorize, route, summarize, and escalate client cases faster.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            title="Active queue"
            value="28"
            desc="Queries currently waiting for action, follow-up, or closure."
            icon={ScrollText}
          />
          <MetricCard
            title="Urgent today"
            value="5"
            desc="High-priority items tied to POD disputes, billing, or route delays."
            icon={ShieldAlert}
          />
          <MetricCard
            title="Avg response"
            value="42m"
            desc="Average first-response time across current client support flow."
            icon={Clock3}
          />
          <MetricCard
            title="Resolved today"
            value="19"
            desc="Customer issues closed by ops, finance, or support teams."
            icon={FileText}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          {queues.map((item) => (
            <QueueCard
              key={item.title}
              title={item.title}
              desc={item.desc}
              count={item.count}
              icon={item.icon}
            />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">Recent queue activity</div>
                <div className="mt-1 text-sm text-white/58">
                  Live examples of the kinds of issues the command center should surface.
                </div>
              </div>

              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white/72">
                Working queue
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {recentItems.map((item) => (
                <ListRow
                  key={item.title}
                  title={item.title}
                  meta={item.meta}
                  status={item.status}
                />
              ))}
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/65">
              Client communication should not disappear into personal inboxes or chat threads.
              Tenant teams need a structured place to see, route, resolve, and learn from
              customer issues across operations, billing, POD, and dispatch.
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <div className="text-sm font-bold text-white">Next upgrade path</div>
            <div className="mt-1 text-sm text-white/58">
              Production-grade capabilities to wire next into the real platform flow.
            </div>

            <div className="mt-5 space-y-3">
              {nextUpgrades.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78"
                >
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-white/45" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
