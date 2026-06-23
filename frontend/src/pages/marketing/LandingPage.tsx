import { Link } from "react-router-dom";
import {
  ArrowRight,
  Package,
  Truck,
  BarChart3,
  Zap,
  Shield,
  MessageCircle,
  MapPin,
  Clock,
  CheckCircle2,
  ChevronRight,
  Star,
} from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

const WA_NUMBER = "27814065725";

/* ── Hero ─────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-indigo-500/8 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[500px] rounded-full bg-sky-600/6 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-4xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300">
            <Zap className="h-4 w-4" />
            Built for South African logistics teams
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight text-white mb-6">
            Run your courier ops
            <br />
            <span className="bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">
              from one platform.
            </span>
          </h1>

          <p className="text-xl text-white/60 leading-relaxed max-w-2xl mb-10">
            Waybills, dispatch, driver tracking, invoicing, COD reconciliation,
            and AI oversight — all in a single platform designed for SA courier
            and freight companies.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4 mb-16">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-sky-500/25 hover:bg-sky-400 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20I'd%20like%20to%20see%20a%20FlowOps%20demo`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-8 py-4 text-base font-black text-emerald-300 hover:bg-emerald-500/15 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              Book a Demo
            </a>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-white/40">
            {[
              "14-day free trial",
              "No credit card required",
              "ZAR billing",
              "SA support",
            ].map((t) => (
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

/* ── Stats ────────────────────────────────────────────────────── */
function Stats() {
  const stats = [
    { value: "R 0", label: "Setup fee", sub: "Always" },
    { value: "14 days", label: "Free trial", sub: "No card needed" },
    { value: "8", label: "User roles", sub: "Granular RBAC" },
    { value: "∞", label: "Waybills", label2: "on Pro+", sub: "Unlimited" },
  ];

  return (
    <section className="border-y border-white/5 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-black text-white mb-1">
                {s.value}
              </div>
              <div className="text-sm font-semibold text-white/50">
                {s.label}
                {s.label2 && (
                  <span className="text-sky-400/60"> {s.label2}</span>
                )}
              </div>
              <div className="text-xs text-white/30 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Features ─────────────────────────────────────────────────── */
function Features() {
  const features = [
    {
      icon: Package,
      color: "sky",
      title: "Waybill Management",
      desc: "OCR-powered waybill capture, barcode scanning, digital register, and full status tracking from pickup to delivery.",
    },
    {
      icon: Truck,
      color: "indigo",
      title: "Driver Dispatch",
      desc: "Real-time GPS tracking, AI-powered driver suggestions, route optimisation, and live telemetry on a live map.",
    },
    {
      icon: BarChart3,
      color: "violet",
      title: "Billing & Invoicing",
      desc: "Rate cards, automatic invoice generation, COD reconciliation, driver wallets, and credit control — all in one place.",
    },
    {
      icon: MessageCircle,
      color: "emerald",
      title: "WhatsApp & Email",
      desc: "Send delivery notifications, collect proof of delivery, and manage client communication via WhatsApp click-to-chat.",
    },
    {
      icon: Shield,
      color: "amber",
      title: "AI Control Tower",
      desc: "6-Claw AI mesh monitors exceptions, route deviations, SLA breach risks, and payment failures in real time.",
    },
    {
      icon: MapPin,
      color: "rose",
      title: "Multi-Branch Support",
      desc: "Manage Johannesburg, Cape Town, Durban and any number of depots from a single owner console with full tenant isolation.",
    },
  ];

  const colorMap: Record<string, string> = {
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    indigo: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  };

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
            Everything in one platform
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Built for how SA couriers actually work
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            No bolt-on modules, no separate systems. Every tool your team needs,
            deeply integrated and live from day one.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, color, title, desc }) => (
            <div
              key={title}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-7 hover:border-white/20 hover:bg-white/[0.05] transition-all"
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${colorMap[color]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">{title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/features"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            See all features
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── How it works ─────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: Clock,
      title: "Get set up in minutes",
      desc: "Create your company, invite your team, and configure your first rate cards. No technical setup needed — the platform guides you.",
    },
    {
      step: "02",
      icon: Package,
      title: "Capture and dispatch",
      desc: "Scan waybills, assign drivers with AI suggestions, and dispatch routes. Clients get automated WhatsApp tracking updates.",
    },
    {
      step: "03",
      icon: BarChart3,
      title: "Get paid faster",
      desc: "Auto-generate invoices from delivered waybills, reconcile COD cash with driver wallets, and track overdue accounts.",
    },
  ];

  return (
    <section className="py-24 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            From zero to dispatching in a day
          </h2>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Most courier companies are live and processing waybills within hours
            of signing up.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="relative">
              <div className="mb-5 flex items-center gap-4">
                <div className="text-5xl font-black text-white/10">{step}</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10">
                <Icon className="h-5 w-5 text-sky-300" />
              </div>
              <h3 className="text-xl font-black text-white mb-3">{title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Social proof ─────────────────────────────────────────────── */
function SocialProof() {
  const testimonials = [
    {
      quote:
        "FlowOps replaced three different systems we were using. Waybill capture, driver dispatch, and invoicing — all in one place. Our billing errors dropped significantly.",
      name: "Operations Director",
      company: "Johannesburg Courier Co.",
    },
    {
      quote:
        "The COD reconciliation feature alone saved us hours every week. Drivers check in, cash is logged automatically, and disputes are easy to resolve.",
      name: "Finance Manager",
      company: "Cape Town Freight Services",
    },
    {
      quote:
        "We tried 3 other platforms before FlowOps. This is the first one that actually understands how South African logistics works — ZAR billing, local carriers, local support.",
      name: "MD",
      company: "Durban Express Logistics",
    },
  ];

  return (
    <section className="py-24 border-t border-white/5 bg-white/[0.01]">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black text-white mb-3">
            Trusted by SA logistics teams
          </h2>
          <p className="text-white/50">
            Companies across Gauteng, Western Cape, and KZN run on FlowOps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-7"
            >
              <div className="flex gap-0.5 mb-4">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
              </div>
              <p className="text-sm text-white/70 leading-relaxed mb-5 italic">
                "{t.quote}"
              </p>
              <div>
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

/* ── CTA band ─────────────────────────────────────────────────── */
function CTABand() {
  return (
    <section className="py-24 border-t border-white/5">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="rounded-[32px] border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-indigo-500/5 to-transparent p-12">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Ready to modernise your operations?
          </h2>
          <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
            Start your 14-day free trial — no credit card, no setup fee, full
            access from day one.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-sky-500/30 hover:bg-sky-400 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20I'm%20interested%20in%20FlowOps`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-base font-black text-white hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              Talk to us on WhatsApp
            </a>
          </div>
          <p className="mt-6 text-sm text-white/30">
            Available on any device · 14-day free trial · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <SocialProof />
      <CTABand />
      <PublicFooter />
    </div>
  );
}
