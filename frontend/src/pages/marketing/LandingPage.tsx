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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: copy */}
          <div>
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
          <div className="flex flex-wrap items-center gap-4 mb-10">
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
          <div className="flex flex-wrap items-center gap-5 text-sm text-white/40">
            {["14-day free trial","No credit card required","ZAR billing","SA support"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400/60" />
                {t}
              </span>
            ))}
          </div>
          </div>

          {/* Right: Logo hero image */}
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-sky-500/20 blur-3xl scale-110" />
              <img
                src="/flowops-logo.jpg"
                alt="FlowOps — Logistics, Evolved"
                className="relative w-full max-w-md rounded-3xl shadow-2xl shadow-sky-500/20 border border-white/10"
                onError={(e) => {
                  // fallback to png if jpg not found
                  e.currentTarget.src = "/flowops-logo.png";
                }}
              />
            </div>
          </div>
      </div>
        </div>
      </div>
    </section>
  );
}

/* ── Stats bar ────────────────────────────────────────────────── */
function Stats() {
  const stats = [
    { value: "50,000+", label: "Deliveries tracked", icon: "📦" },
    { value: "500+",    label: "Active drivers",     icon: "🚚" },
    { value: "30+",     label: "Courier companies",  icon: "🏢" },
    { value: "99.9%",   label: "Platform uptime",    icon: "⚡" },
  ];

  return (
    <section className="border-y border-white/5 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-white/5">
          {stats.map((s) => (
            <div key={s.label} className="text-center py-4 md:py-0 md:px-6 first:pt-0 last:pb-0">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-4xl font-black text-white mb-1 tracking-tight">
                {s.value}
              </div>
              <div className="text-sm font-medium text-white/40">{s.label}</div>
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
      desc: "OCR-powered capture, barcode scanning, digital register, and full status tracking from pickup to signed delivery.",
      tag: "Core",
    },
    {
      icon: Truck,
      color: "indigo",
      title: "Driver Dispatch & GPS",
      desc: "AI-ranked driver suggestions, live telemetry map, route optimisation, and 30-second auto-refresh across your whole fleet.",
      tag: "Ops",
    },
    {
      icon: BarChart3,
      color: "violet",
      title: "Billing & Invoicing",
      desc: "Rate cards, automatic invoice batches, COD reconciliation with per-driver wallets, and credit control — all in one screen.",
      tag: "Finance",
    },
    {
      icon: MessageCircle,
      color: "emerald",
      title: "WhatsApp & Email Hub",
      desc: "Automated delivery status updates via WhatsApp click-to-chat and email. Clients get tracking links without you lifting a finger.",
      tag: "Comms",
    },
    {
      icon: Shield,
      color: "amber",
      title: "AI Control Tower",
      desc: "6-Claw AI mesh monitors route deviations, SLA breach risks, payment failures, and driver capacity — resolves incidents proactively.",
      tag: "AI",
    },
    {
      icon: MapPin,
      color: "rose",
      title: "Multi-Branch & Multi-Tenant",
      desc: "Manage JHB, CPT, DBN and unlimited depots from one owner console. Full tenant isolation with role-based access per company.",
      tag: "Enterprise",
    },
    {
      icon: Clock,
      color: "sky",
      title: "Customer Tracking Page",
      desc: "Branded public tracking URL per waybill with live ETA, driver location map, delivery timeline, and 1-click proof of delivery.",
      tag: "Customer",
    },
    {
      icon: Zap,
      color: "indigo",
      title: "API, Webhooks & Shopify",
      desc: "Public REST API, HMAC-signed webhooks, and a Shopify connector to auto-create waybills from ecommerce orders.",
      tag: "Integrations",
    },
  ];

  const colorMap: Record<string, string> = {
    sky:     "border-sky-400/20     bg-sky-400/10     text-sky-300",
    indigo:  "border-indigo-400/20  bg-indigo-400/10  text-indigo-300",
    violet:  "border-violet-400/20  bg-violet-400/10  text-violet-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    amber:   "border-amber-400/20   bg-amber-400/10   text-amber-300",
    rose:    "border-rose-400/20    bg-rose-400/10    text-rose-300",
  };

  const tagColor: Record<string, string> = {
    Core:         "border-sky-400/20     bg-sky-400/10     text-sky-400",
    Ops:          "border-indigo-400/20  bg-indigo-400/10  text-indigo-400",
    Finance:      "border-violet-400/20  bg-violet-400/10  text-violet-400",
    Comms:        "border-emerald-400/20 bg-emerald-400/10 text-emerald-400",
    AI:           "border-amber-400/20   bg-amber-400/10   text-amber-400",
    Enterprise:   "border-rose-400/20    bg-rose-400/10    text-rose-400",
    Customer:     "border-sky-400/20     bg-sky-400/10     text-sky-400",
    Integrations: "border-indigo-400/20  bg-indigo-400/10  text-indigo-400",
  };

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, color, title, desc, tag }) => (
            <div
              key={title}
              className="group rounded-[24px] border border-white/8 bg-white/[0.025] p-6 hover:border-white/15 hover:bg-white/[0.045] transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${colorMap[color]}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${tagColor[tag]}`}>
                  {tag}
                </span>
              </div>
              <h3 className="text-base font-black text-white mb-2 leading-snug">{title}</h3>
              <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/features"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            See full feature list
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Visual Gallery ───────────────────────────────────────────── */
function VisualGallery() {
  const images = [
    { src: "/flowops-render1.png", alt: "FlowOps platform" },
    { src: "/flowops-render2.png", alt: "FlowOps logistics" },
    { src: "/flowops-render3.png", alt: "FlowOps operations" },
    { src: "/flowops-photo1.jpg",  alt: "FlowOps team" },
    { src: "/flowops-photo2.jpg",  alt: "FlowOps courier" },
  ];

  return (
    <section className="py-16 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/30">
            Logistics, Evolved.
          </p>
        </div>

        {/*
          CSS masonry via `columns` — each image renders at its
          full natural height so nothing is ever cropped.
        */}
        <div className="columns-2 md:columns-3 gap-4 space-y-4">
          {images.map((img, i) => (
            <div key={i} className="break-inside-avoid">
              <img
                src={img.src}
                alt={img.alt}
                className="w-full rounded-[24px] border border-white/10 block"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function HowItWorks() {
  const steps = [
    {
      step: "01",
      color: "sky",
      icon: Clock,
      title: "Get set up in minutes",
      desc: "Create your company, invite your team, and configure your first rate cards. No technical setup — the platform guides you every step.",
      bullets: [
        "Import existing clients and rate cards",
        "Invite drivers with a PIN setup link",
        "Configure branches and depots",
      ],
    },
    {
      step: "02",
      color: "indigo",
      icon: Package,
      title: "Capture, dispatch & track",
      desc: "Scan or manually create waybills, assign drivers with AI routing suggestions, and track every delivery in real time.",
      bullets: [
        "OCR waybill scanning from photos",
        "AI-ranked driver suggestions",
        "WhatsApp tracking links auto-sent",
      ],
    },
    {
      step: "03",
      color: "emerald",
      icon: BarChart3,
      title: "Invoice and get paid",
      desc: "Auto-generate invoices from delivered waybills, reconcile COD cash with driver wallets, and chase overdue accounts from one screen.",
      bullets: [
        "One-click invoice batch generation",
        "COD wallet per driver — live balance",
        "Overdue escalation & payment reminders",
      ],
    },
  ];

  const colorMap: Record<string, { border: string; bg: string; text: string; num: string }> = {
    sky:     { border: "border-sky-400/30",     bg: "bg-sky-500/10",     text: "text-sky-300",     num: "text-sky-400/20" },
    indigo:  { border: "border-indigo-400/30",  bg: "bg-indigo-500/10",  text: "text-indigo-300",  num: "text-indigo-400/20" },
    emerald: { border: "border-emerald-400/30", bg: "bg-emerald-500/10", text: "text-emerald-300", num: "text-emerald-400/20" },
  };

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
            How it works
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            From zero to dispatching in one day
          </h2>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Most courier companies are live and processing waybills within hours
            of signing up — no IT project required.
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Connector line (desktop only) */}
          <div className="hidden md:block absolute top-8 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-sky-400/20 via-indigo-400/20 to-emerald-400/20 pointer-events-none" />

          {steps.map(({ step, color, icon: Icon, title, desc, bullets }) => {
            const c = colorMap[color];
            return (
              <div key={step} className="relative flex flex-col">
                {/* Step number + icon */}
                <div className="flex items-center gap-4 mb-6">
                  <div className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border ${c.border} ${c.bg} z-10`}>
                    <Icon className={`h-7 w-7 ${c.text}`} />
                    <span className={`absolute -top-2 -right-2 text-xs font-black ${c.text} bg-[#07111f] px-1.5 py-0.5 rounded-full border ${c.border}`}>
                      {step}
                    </span>
                  </div>
                  <div className={`text-6xl font-black ${c.num} leading-none select-none`}>{step}</div>
                </div>

                <h3 className="text-xl font-black text-white mb-3">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed mb-5">{desc}</p>

                <ul className="space-y-2 mt-auto">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-white/60">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${c.text}`} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* CTA under steps */}
        <div className="mt-14 text-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-sky-500/25 hover:bg-sky-400 transition-colors"
          >
            Start for free today
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-3 text-xs text-white/30">
            14-day trial · No credit card · ZAR billing
          </p>
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
      <VisualGallery />
      <HowItWorks />
      <SocialProof />
      <CTABand />
      <PublicFooter />
    </div>
  );
}
