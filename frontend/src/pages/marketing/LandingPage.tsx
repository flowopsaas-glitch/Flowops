import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronLeft,
  X,
  ZoomIn,
  Star,
  Ship,
  Activity,
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

/* ── E-commerce Opportunity ────────────────────────────────────── */
function EcommerceOpportunity() {
  const stats = [
    { value: "R100B+", label: "SA e-commerce by 2026", icon: "🛒" },
    { value: "60–70%", label: "of couriers still use paper", icon: "📄" },
    { value: "3×", label: "growth in online orders since 2020", icon: "📈" },
  ];

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
            Market Opportunity
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            South Africa's e-commerce boom needs
            <br />
            <span className="bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">
              delivery infrastructure
            </span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            The SA e-commerce market is racing toward R100 billion by 2026, but
            most courier companies still run on paper, phone calls, and
            spreadsheets. That gap is your opportunity.
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-md p-8 text-center hover:border-sky-400/20 hover:bg-white/[0.05] transition-all duration-200"
            >
              <div className="text-3xl mb-3">{s.icon}</div>
              <div className="text-4xl font-black text-white mb-2 tracking-tight bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">
                {s.value}
              </div>
              <div className="text-sm font-medium text-white/50">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Positioning card */}
        <div className="rounded-[32px] border border-sky-400/15 bg-gradient-to-br from-sky-500/8 via-indigo-500/5 to-transparent backdrop-blur-md p-10 text-center">
          <p className="text-lg text-white/70 leading-relaxed max-w-3xl mx-auto mb-8">
            Online retailers need courier partners who can offer real-time
            tracking, automated waybill creation, and instant proof of delivery.
            FlowOps gives you the platform to plug into this R100 billion
            ecosystem — without building tech from scratch.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-sky-500/25 hover:bg-sky-400 transition-colors"
          >
            Digitise your operations
            <ArrowRight className="h-5 w-5" />
          </Link>
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
      desc: "Run JHB, CPT, DBN and unlimited depots from one console — included from Professional. Group operators also get a multi-tenant owner console with full company isolation and per-company roles.",
      tag: "Pro",
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
    {
      icon: Ship,
      color: "cyan",
      title: "Freight Forwarding",
      desc: "Import/export shipment files across ocean, air & road — containers, customs (SA duty/VAT + AI HS codes), SAD500/B-L docs and demurrage, bridged to the domestic last mile.",
      tag: "Enterprise",
    },
    {
      icon: Activity,
      color: "rose",
      title: "Decision Intelligence",
      desc: "Command centres on every department — arrivals & customs queues, in-transit health, quote win-rate, carrier lane savings, billing-coverage leakage and recovery cockpits. All from your live data.",
      tag: "Analytics",
    },
  ];

  const colorMap: Record<string, string> = {
    sky:     "border-sky-400/20     bg-sky-400/10     text-sky-300",
    indigo:  "border-indigo-400/20  bg-indigo-400/10  text-indigo-300",
    violet:  "border-violet-400/20  bg-violet-400/10  text-violet-300",
    cyan:    "border-cyan-400/20    bg-cyan-400/10    text-cyan-300",
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
    Pro:          "border-violet-400/20  bg-violet-400/10  text-violet-400",
    Enterprise:   "border-rose-400/20    bg-rose-400/10    text-rose-400",
    Customer:     "border-sky-400/20     bg-sky-400/10     text-sky-400",
    Integrations: "border-indigo-400/20  bg-indigo-400/10  text-indigo-400",
    Analytics:    "border-cyan-400/20    bg-cyan-400/10    text-cyan-400",
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
type GalleryImage = {
  src: string;
  alt: string;
  caption: string;
  /** grid sizing for the thumbnail tile */
  tile: string;
};

const GALLERY: GalleryImage[] = [
  {
    src: "/flowops-render1.png",
    alt: "FlowOps platform — workflow automation, team collaboration and system integration",
    caption: "Automate. Orchestrate. Innovate. Elevate. — all in flow.",
    tile: "col-span-2 md:col-span-1 md:row-span-2 min-h-[280px] h-full",
  },
  {
    src: "/flowops-render2.png",
    alt: "FlowOps — Platform. Control. Results.",
    caption: "Platform. Control. Results.",
    tile: "aspect-square",
  },
  {
    src: "/flowops-render3.png",
    alt: "FlowOps — all your operations, one powerful flow",
    caption: "All your operations. One powerful flow.",
    tile: "aspect-square",
  },
  {
    src: "/flowops-photo1.jpg",
    alt: "FlowOps — one platform, infinite impact",
    caption: "One platform. Infinite impact.",
    tile: "aspect-video",
  },
  {
    src: "/flowops-photo2.jpg",
    alt: "FlowOps — real-time logistics operations in action",
    caption: "Real-time visibility, end to end.",
    tile: "aspect-video",
  },
];

function VisualGallery() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isOpen = openIndex !== null;

  const open = useCallback((i: number) => {
    setZoomed(false);
    setOpenIndex(i);
  }, []);

  const close = useCallback(() => {
    setOpenIndex(null);
    setZoomed(false);
  }, []);

  const go = useCallback((dir: number) => {
    setZoomed(false);
    setOpenIndex((i) =>
      i === null ? i : (i + dir + GALLERY.length) % GALLERY.length
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, go]);

  const active = isOpen ? GALLERY[openIndex as number] : null;

  return (
    <section className="py-16 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/30">
            Logistics, Evolved.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {GALLERY.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => open(i)}
              aria-label={`View full image: ${img.caption}`}
              className={`group relative block w-full overflow-hidden rounded-[24px] border border-white/10 cursor-zoom-in bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${img.tile}`}
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              />
              {/* hover affordance */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                  <ZoomIn className="h-3.5 w-3.5" />
                  View full image
                </span>
              </span>
              {/* caption */}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3 pt-10 text-left text-xs font-medium text-white/90 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                {img.caption}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Tap any image to view it in full.
        </p>
      </div>

      {/* Lightbox */}
      {isOpen && active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.caption}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={close}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (zoomed || touchStartX.current === null) {
              touchStartX.current = null;
              return;
            }
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchStartX.current = null;
          }}
        >
          {/* top bar */}
          <div
            className="absolute top-0 inset-x-0 flex items-center justify-between p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm">
              {(openIndex as number) + 1} / {GALLERY.length}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* previous */}
          {GALLERY.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Previous image"
              className="absolute left-2 sm:left-6 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* image — object-contain shows the ENTIRE photo, no cropping */}
          <div
            className={`relative max-h-[88vh] max-w-[92vw] ${
              zoomed ? "overflow-auto" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={active.src}
              alt={active.alt}
              onClick={() => setZoomed((z) => !z)}
              className={`mx-auto rounded-xl shadow-2xl transition-transform duration-300 ${
                zoomed
                  ? "max-w-none w-auto h-auto cursor-zoom-out"
                  : "max-h-[80vh] max-w-[92vw] object-contain cursor-zoom-in"
              }`}
            />
          </div>

          {/* next */}
          {GALLERY.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Next image"
              className="absolute right-2 sm:right-6 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* caption + hints */}
          <div
            className="absolute bottom-0 inset-x-0 p-4 sm:p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mx-auto max-w-2xl text-sm font-medium text-white/90">
              {active.caption}
            </p>
            <p className="mt-1 text-xs text-white/40">
              Click image to {zoomed ? "zoom out" : "zoom in"} · Esc to close
              {GALLERY.length > 1 ? " · ← → to navigate" : ""}
            </p>
          </div>
        </div>
      )}
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

/* ── Digitisation CTA ─────────────────────────────────────────── */
function DigitisationCTA() {
  const painPoints = [
    {
      paper: "Lost waybills & manual registers",
      digital: "OCR scanning & digital waybill register",
      icon: "📋",
    },
    {
      paper: "No real-time tracking",
      digital: "Live GPS tracking for every delivery",
      icon: "📍",
    },
    {
      paper: "Manual invoicing & billing errors",
      digital: "Auto-invoicing from delivered waybills",
      icon: "🧾",
    },
    {
      paper: "COD cash leakage & disputes",
      digital: "Driver wallet reconciliation per delivery",
      icon: "💸",
    },
  ];

  return (
    <section className="py-28 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            Time to digitise
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Still running on paper?
            <br />
            <span className="bg-gradient-to-r from-amber-300 to-rose-300 bg-clip-text text-transparent">
              You're leaving money on the table.
            </span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            60–70% of emerging market couriers still rely on paper processes.
            Every lost waybill, every untracked delivery, every manual invoice
            is revenue leaking out of your business.
          </p>
        </div>

        {/* Paper vs Digital grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {painPoints.map((p) => (
            <div
              key={p.paper}
              className="group rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-md p-6 hover:border-sky-400/20 hover:bg-white/[0.05] transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl shrink-0 mt-1">{p.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-400/80" />
                    <span className="text-sm font-bold text-rose-300/80 line-through decoration-rose-400/40">
                      {p.paper}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/80" />
                    <span className="text-sm font-bold text-emerald-300">
                      {p.digital}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-[32px] border border-sky-400/15 bg-gradient-to-br from-sky-500/8 via-indigo-500/5 to-transparent backdrop-blur-md p-10 text-center">
          <p className="text-lg text-white/70 leading-relaxed max-w-2xl mx-auto mb-8">
            FlowOps replaces your clipboards, carbon copies, and cash envelopes
            with a single platform your drivers, dispatchers, and accountants
            all work from — live and in sync.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white shadow-xl shadow-sky-500/25 hover:bg-sky-400 transition-colors"
          >
            Start your digital transformation
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-4 text-xs text-white/30">
            Most teams are fully digital within 48 hours · No IT project needed
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
      <EcommerceOpportunity />
      <Features />
      <VisualGallery />
      <HowItWorks />
      <DigitisationCTA />
      <SocialProof />
      <CTABand />
      <PublicFooter />
    </div>
  );
}
