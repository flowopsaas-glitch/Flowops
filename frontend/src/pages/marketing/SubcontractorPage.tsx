import { Link } from "react-router-dom";
import {
  ArrowRight, Shield, Truck, BarChart3, Clock, MapPin,
  CheckCircle2, Zap, MessageCircle, Star, Target, Award,
  TrendingUp, DollarSign, Package, Activity, Lock, Eye,
} from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

const WA_NUMBER = "27606592875";

/* ── Hero ─────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/3 h-[700px] w-[700px] rounded-full bg-emerald-500/8 blur-[140px]" />
        <div className="absolute top-1/2 right-0 h-[400px] w-[400px] rounded-full bg-sky-500/6 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[400px] rounded-full bg-violet-500/5 blur-[90px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
            <Shield className="h-4 w-4" />
            Built for transport operators who deliver for the big names
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-white mb-6">
            Your deliveries.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
              Your data. Your growth.
            </span>
          </h1>

          <p className="text-xl text-white/60 leading-relaxed max-w-2xl mb-10">
            You're the backbone of South Africa's last mile — running 50, 500, or
            5,000 deliveries a day for retailers, 3PLs, and enterprise shippers.
            FlowOps gives you the operations platform to prove your performance,
            protect your contracts, and scale without the chaos.
          </p>

          <div className="flex flex-wrap items-center gap-4 mb-10">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-400 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20I%20run%20a%20last-mile%20fleet%20and%20want%20to%20see%20FlowOps%20for%20subcontractors`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-base font-black text-white/80 hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              Talk to us
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-white/40">
            {["14-day free trial", "No lock-in contract", "ZAR billing", "Live in 24 hours"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400/60" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── The Problem ──────────────────────────────────────────────── */
function TheProblem() {
  const problems = [
    {
      icon: Eye,
      title: "No visibility = no leverage",
      desc: "Your principal shipper can see their own data. You can't prove your on-time rate, your POD compliance, or why that SLA breach wasn't your fault.",
    },
    {
      icon: DollarSign,
      title: "COD cash disappears",
      desc: "Driver collected R2,400 three days ago. Did he settle? Which waybills? Paper-based reconciliation loses you 3-8% of COD revenue every month.",
    },
    {
      icon: Clock,
      title: "Scaling breaks everything",
      desc: "You won a new route. Now you're hiring 6 drivers, managing 200 more deliveries a day, and your WhatsApp groups are on fire. Ops by chat doesn't scale.",
    },
    {
      icon: Target,
      title: "Contract renewals are a gamble",
      desc: "When your shipper asks 'what's your delivery success rate this quarter?' you shouldn't need two days and a spreadsheet to answer.",
    },
  ];

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
            The reality
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Running a fleet on spreadsheets
            <br />
            <span className="bg-gradient-to-r from-rose-300 to-amber-300 bg-clip-text text-transparent">
              is costing you contracts.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {problems.map((p) => (
            <div
              key={p.title}
              className="group rounded-[24px] border border-white/8 bg-white/[0.025] p-7 hover:border-rose-400/15 hover:bg-white/[0.04] transition-all"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-rose-300 mb-4">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">{p.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── The Solution ─────────────────────────────────────────────── */
function TheSolution() {
  const capabilities = [
    {
      icon: Package,
      color: "sky",
      title: "Digital Waybill Register",
      desc: "Scan, create, and track every parcel in a single system. OCR capture from paper waybills, barcode scanning at the hub, and a full digital audit trail.",
    },
    {
      icon: MapPin,
      color: "emerald",
      title: "Live Fleet Visibility",
      desc: "Know where every driver is, right now. GPS telemetry with 30-second refresh, geofenced delivery zones, and predictive ETA that accounts for SA traffic patterns.",
    },
    {
      icon: Shield,
      color: "violet",
      title: "Load Verification & POD",
      desc: "Scan-confirm every parcel onto the vehicle before dispatch. Capture e-signatures and photos at delivery. Irrefutable proof — no more disputes.",
    },
    {
      icon: BarChart3,
      color: "amber",
      title: "SLA Compliance Dashboard",
      desc: "Real-time on-time %, breach counts, and delivery success rate — always ready for your next contract review. No spreadsheets, no guesswork.",
    },
    {
      icon: DollarSign,
      color: "emerald",
      title: "COD Wallet & Reconciliation",
      desc: "Every rand collected by every driver, tracked per-waybill with a live balance. Auto-reconcile settlements. Stop the 3-8% COD leakage overnight.",
    },
    {
      icon: TrendingUp,
      color: "sky",
      title: "AI Route Optimization",
      desc: "Nearest-neighbour + 2-opt sequencing cuts km by 15-25%. See estimated fuel savings in rands before you dispatch. Your drivers finish earlier, you spend less on diesel.",
    },
    {
      icon: Activity,
      color: "violet",
      title: "AI Operations Intelligence",
      desc: "Proactive risk detection — SLA breach warnings before they happen, driver capacity alerts, payment failures flagged in real time. Not a dashboard you stare at; a system that tells you what's wrong.",
    },
    {
      icon: Award,
      color: "amber",
      title: "Driver Performance & Gamification",
      desc: "Rank your fleet by composite score — deliveries, on-time rate, customer ratings. Your best drivers know they're the best. Your weakest know they need to improve.",
    },
  ];

  const colorMap: Record<string, string> = {
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  };

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            The platform
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            One system. Every delivery.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
              Total operational control.
            </span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            FlowOps replaces your clipboard, your WhatsApp groups, your
            spreadsheets, and your cash book — with a single platform your
            drivers, dispatchers, and accountants all work from.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {capabilities.map(({ icon: Icon, color, title, desc }) => (
            <div
              key={title}
              className="group rounded-[24px] border border-white/8 bg-white/[0.025] p-6 hover:border-white/15 hover:bg-white/[0.045] transition-all"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${colorMap[color]} mb-4`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-black text-white mb-2 leading-snug">{title}</h3>
              <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Contract Protection ──────────────────────────────────────── */
function ContractProtection() {
  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="rounded-[32px] border border-emerald-400/15 bg-gradient-to-br from-emerald-500/8 via-sky-500/5 to-transparent backdrop-blur-md overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Left: copy */}
            <div className="p-10 lg:p-14">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                <Lock className="h-3 w-3" /> Contract protection
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                When your shipper asks for numbers,
                <br />you answer in seconds.
              </h2>
              <p className="text-base text-white/60 leading-relaxed mb-8">
                Enterprise shippers audit their last-mile partners quarterly.
                On-time rate, POD compliance, SLA breaches, delivery success
                rate, customer satisfaction. FlowOps computes all of it
                continuously — you never scramble for a review again.
              </p>

              <div className="space-y-4">
                {[
                  { metric: "On-time delivery rate", example: "94.7%" },
                  { metric: "POD compliance", example: "99.2%" },
                  { metric: "SLA breaches this quarter", example: "3 (down from 18)" },
                  { metric: "Customer satisfaction", example: "4.6 / 5" },
                  { metric: "Avg delivery time", example: "2h 14m" },
                ].map((m) => (
                  <div key={m.metric} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                    <span className="text-sm font-bold text-white/60">{m.metric}</span>
                    <span className="text-sm font-black text-emerald-300">{m.example}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: visual */}
            <div className="hidden lg:flex items-center justify-center p-10 bg-gradient-to-br from-emerald-500/[0.04] to-transparent">
              <div className="relative">
                <div className="absolute inset-0 rounded-3xl bg-emerald-500/10 blur-3xl scale-110" />
                <div className="relative rounded-3xl border border-white/10 bg-[#0a1628] p-8 shadow-2xl w-[320px]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-4">Performance Score</div>
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative h-32 w-32">
                      <svg width={128} height={128} className="-rotate-90">
                        <circle cx={64} cy={64} r={52} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
                        <circle cx={64} cy={64} r={52} fill="none" stroke="#34d399" strokeWidth={10}
                          strokeDasharray={327} strokeDashoffset={33} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-emerald-400">A+</span>
                        <span className="text-[10px] text-white/40">90/100</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-white/40">Deliveries</span><span className="font-bold text-white">1,247</span></div>
                    <div className="flex justify-between"><span className="text-white/40">On-time</span><span className="font-bold text-emerald-400">94.7%</span></div>
                    <div className="flex justify-between"><span className="text-white/40">COD settled</span><span className="font-bold text-white">R184,320</span></div>
                    <div className="flex justify-between"><span className="text-white/40">Rating</span><span className="font-bold text-amber-300">4.6/5</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Social Proof ─────────────────────────────────────────────── */
function SocialProof() {
  const testimonials = [
    {
      quote: "We went from panicking before every quarterly review to walking in with live dashboards. Our shipper extended our contract for 3 years.",
      name: "Fleet Manager",
      company: "JHB last-mile operator, 38 vehicles",
    },
    {
      quote: "COD reconciliation alone saved us over R40,000 in the first month. We didn't even know we were losing that much to driver cash discrepancies.",
      name: "Operations Director",
      company: "Durban courier company, 22 drivers",
    },
    {
      quote: "Our guys were sceptical about the driver app. Within a week they were competing on the leaderboard. On-time rate jumped 12% in the first month.",
      name: "Owner",
      company: "Cape Town express delivery, 15 vehicles",
    },
  ];

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-white">
            SA transport operators trust FlowOps
          </h2>
          <p className="mt-2 text-sm text-white/40">Real results from real fleets</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.company}
              className="rounded-[24px] border border-white/8 bg-white/[0.025] p-7 flex flex-col"
            >
              <div className="flex gap-1 mb-4">
                {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />)}
              </div>
              <p className="text-sm text-white/70 leading-relaxed flex-1 italic">"{t.quote}"</p>
              <div className="mt-5 pt-4 border-t border-white/5">
                <div className="text-sm font-bold text-white">{t.name}</div>
                <div className="text-xs text-white/40">{t.company}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing CTA ──────────────────────────────────────────────── */
function PricingCTA() {
  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="rounded-[32px] border border-emerald-400/15 bg-gradient-to-br from-emerald-500/8 via-sky-500/5 to-transparent backdrop-blur-md p-12 lg:p-16">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Start protecting your contracts
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
              today.
            </span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto mb-8">
            14-day free trial. No credit card. No lock-in. Go live in 24 hours
            and show your shipper real-time data at your next review.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-400 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20I%20run%20a%20transport%20fleet%20and%20want%20to%20see%20FlowOps`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-base font-black text-white/80 hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp us
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-white/30">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" /> From R0/mo (Starter)</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" /> Unlimited waybills on Pro</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" /> SA-based support</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Page Export ───────────────────────────────────────────────── */
export default function SubcontractorPage() {
  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />
      <Hero />
      <TheProblem />
      <TheSolution />
      <ContractProtection />
      <SocialProof />
      <PricingCTA />
      <PublicFooter />
    </div>
  );
}
