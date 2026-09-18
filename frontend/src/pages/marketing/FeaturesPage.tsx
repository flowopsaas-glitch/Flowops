import { Link } from "react-router-dom";
import {
  Package, Truck, BarChart3, MessageCircle, Shield,
  MapPin, FileText, Scan, Wallet, Route, Bell, Users,
  CheckCircle2, ArrowRight, Zap, Bot, ShieldCheck, Ship, Mail, RotateCcw,
  Activity, TrendingUp, Target, LifeBuoy, PackageCheck, Train,
} from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

const sections = [
  {
    label: "Operations",
    color: "sky",
    features: [
      {
        icon: Package,
        title: "Waybill Management",
        points: [
          "OCR-powered waybill capture from photos",
          "Barcode & QR batch scanning",
          "Full status lifecycle (Pending → Delivered)",
          "Proof of delivery with signature + photo",
          "Recipient email notifications on status change",
        ],
      },
      {
        icon: Truck,
        title: "Driver Dispatch",
        points: [
          "Real-time GPS tracking on live map",
          "AI-scored driver suggestions (availability, load, proximity)",
          "Route optimisation with stop sequencing",
          "Offline POD capture — syncs when back online",
          "Driver mobile portal with Zulu / Afrikaans / Xhosa support",
        ],
      },
      {
        icon: Route,
        title: "Route Optimizer",
        points: [
          "Nearest-neighbour + 2-opt algorithm",
          "Supports up to 50 stops per route",
          "Distance and ETA estimates",
          "Save and assign optimised routes to drivers",
        ],
      },
    ],
  },
  {
    label: "Billing & Finance",
    color: "indigo",
    features: [
      {
        icon: BarChart3,
        title: "Invoicing",
        points: [
          "Auto-generate invoices from delivered waybills",
          "Line-item control with VAT calculation",
          "Send invoices directly from the platform",
          "Paid / Sent / Overdue / Draft status tracking",
          "PDF print and CSV export",
        ],
      },
      {
        icon: Wallet,
        title: "COD Reconciliation",
        points: [
          "Driver wallets track cash on delivery",
          "Geofence auto-trigger on arrival at recipient",
          "Settlement workflow with audit trail",
          "Outstanding COD dashboard per driver",
        ],
      },
      {
        icon: FileText,
        title: "Rate Cards & Quotes",
        points: [
          "Zone-based rate cards with weight bands",
          "Multi-carrier rate shopping (Aramex, DHL, PostNet, more)",
          "Generate and accept quotes",
          "Customer portal for booking requests",
        ],
      },
      {
        icon: RotateCcw,
        title: "Returns / RMA",
        points: [
          "Full RMA lifecycle — request, collect, inspect, resolve",
          "Refund, replace, restock or dispose outcomes",
          "Warehouse receiving & inspection workflow",
          "Credit-note generation on approved returns",
        ],
      },
    ],
  },
  {
    label: "Warehousing & Fulfilment",
    color: "amber",
    features: [
      {
        icon: PackageCheck,
        title: "Warehouse Management System (WMS)",
        points: [
          "Multi-warehouse support with zone hierarchy (Receiving, Bulk, Pick, Dispatch, Cold, Hazmat)",
          "Bin locations with rack/level/position addressing",
          "Full goods receipt workflow — expected, arrived, inspected, put-away",
          "AI-powered put-away suggestions (consolidation + capacity-aware)",
          "SKU-level inventory with batch, lot & expiry tracking",
        ],
      },
      {
        icon: Scan,
        title: "Pick, Pack & Dispatch",
        points: [
          "Order-driven pick lists with AI-optimized FEFO bin selection",
          "Barcode scan verification at load-out",
          "Shortest-path pick sequencing through warehouse",
          "Pack confirmation with shipment linking",
          "Dock scheduling for inbound & outbound vehicles",
        ],
      },
      {
        icon: Activity,
        title: "Inventory Intelligence",
        points: [
          "Scheduled cycle counts (Full, ABC, Zone, SKU-based)",
          "Variance tracking with auto-adjustment posting",
          "AI replenishment engine (bulk → pick face auto-trigger)",
          "Stock transfer, adjustments & full movement audit trail",
          "Real-time KPIs: throughput, accuracy, utilisation, dwell time",
        ],
      },
    ],
  },
  {
    label: "Communications",
    color: "emerald",
    features: [
      {
        icon: MessageCircle,
        title: "WhatsApp Hub",
        points: [
          "Click-to-chat using your own WhatsApp number",
          "Auto-send status updates to recipients",
          "Thread history per client",
          "No Meta Business API required",
        ],
      },
      {
        icon: Bell,
        title: "Notifications",
        points: [
          "In-app notification feed with read/unread",
          "Email alerts on SLA breach risk",
          "Trial expiry and payment reminders",
          "Configurable per-user notification preferences",
        ],
      },
      {
        icon: Mail,
        title: "Email Hub",
        points: [
          "Unified inbox for ops & client email",
          "AI triage and logistics-data extraction",
          "Attachment threat scanning",
          "Auto-promote bookings into waybills",
        ],
      },
    ],
  },
  {
    label: "AI & Intelligence",
    color: "violet",
    features: [
      {
        icon: Shield,
        title: "AI Control Tower",
        points: [
          "6-Claw AI mesh monitors operations continuously",
          "Route deviation and SLA breach risk alerts",
          "Exception rate monitoring per tenant",
          "One-click resolve or dismiss from the dashboard",
        ],
      },
      {
        icon: BarChart3,
        title: "Performance KPIs",
        points: [
          "On-time delivery %, delivery success rate",
          "Average delivery time and exception rate",
          "Revenue per waybill with 30-day trend deltas",
          "Time-series trend charts (7 / 30 / 90-day) for volume & revenue",
          "Outstanding AR aging buckets",
        ],
      },
    ],
  },
  {
    label: "Decision Intelligence",
    color: "rose",
    features: [
      {
        icon: Activity,
        title: "Department Command Centres",
        points: [
          "Freight-forwarding control tower — arrivals board, customs queue, exceptions-as-tasks",
          "Ops exception-SLA tracker — aged failed/returned waybills vs a 24h SLA",
          "In-transit shipment health — ETA breaches, stalled shipments & dwell time",
          "Every exception deep-links straight to the record to action",
        ],
      },
      {
        icon: TrendingUp,
        title: "Revenue & Finance Intelligence",
        points: [
          "Billing coverage audit — catches delivered-but-unbilled revenue leakage",
          "Disbursement recovery cockpit — recovery rate, client exposure & ageing",
          "Quote conversion pipeline — win rate, open pipeline & won/lost value",
          "Carrier lane rate explorer — cheapest buy-rate per lane + savings available",
        ],
      },
      {
        icon: Target,
        title: "Customer & Returns Intelligence",
        points: [
          "Client portfolio — billing mix, credit exposure & contract-renewal watch",
          "Returns intelligence — reason mix, cycle time & restock recovery",
          "Collections scheduling efficiency — unassigned ageing & on-time pickup",
          "All from your own live data — no fabricated benchmarks",
        ],
      },
    ],
  },
  {
    label: "Platform & Admin",
    color: "amber",
    features: [
      {
        icon: Users,
        title: "Multi-Role Access",
        points: [
          "8 built-in roles: Admin, Manager, Dispatch, Warehouse, Agent, Driver, Finance, Viewer",
          "Per-user permission overrides",
          "Persona-aware dashboards per role",
          "Audit trail of all admin actions",
        ],
      },
      {
        icon: MapPin,
        title: "Multi-Branch",
        points: [
          "Unlimited branches (depots, hubs)",
          "Manifest and linehaul between branches",
          "Per-branch waybill and driver assignment",
          "Owner console to manage all tenants from one screen",
        ],
      },
      {
        icon: Scan,
        title: "Integrations",
        points: [
          "Public REST API with API key management",
          "Signed webhooks with exponential back-off retries",
          "Shopify and WooCommerce order → waybill connectors",
          "Geocoding pipeline (Nominatim / Google / Mapbox)",
        ],
      },
    ],
  },
  {
    label: "Enterprise",
    color: "cyan",
    features: [
      {
        icon: Bot,
        title: "CLAW Autopilot",
        points: [
          "Autonomous ops — detects risk and takes safe, confidence-gated actions",
          "Auto-assigns stalled pickups and escalates SLA pre-breaches",
          "Flags COD mismatches before they cost you",
          "Adjustable aggression with full action audit log",
        ],
      },
      {
        icon: Ship,
        title: "Freight Forwarding",
        points: [
          "Import/export shipment files — ocean, air & road",
          "Container (ISO 6346), cargo, charges & margin tracking",
          "SA customs estimator (ATV-based VAT) + AI HS classification",
          "Commercial invoice, packing list, B/L & SAD500 PDFs",
        ],
      },
      {
        icon: Train,
        title: "Rail & Intermodal",
        points: [
          "Rail consignment lifecycle — planned → loaded → in-transit → offloaded",
          "Wagon/rake register with tonnage, seals & last-known siding",
          "Road↔rail↔port intermodal handoffs with dwell-time tracking",
          "SADC corridor KPIs — on-time %, transit time & interchange dwell",
        ],
      },
      {
        icon: ShieldCheck,
        title: "Single Sign-On (SSO)",
        points: [
          "OIDC SSO — Okta, Azure AD, Google Workspace, Auth0",
          "Just-in-time user provisioning on first login",
          "Domain restriction and default-role mapping",
          "Centralised identity for your whole team",
        ],
      },
      {
        icon: LifeBuoy,
        title: "AI Support Agent",
        points: [
          "In-app product help grounded in your live operational data",
          "Answers “where is my shipment / invoice / driver” instantly",
          "Guides staff through workflows without leaving the app",
          "Escalates to a human with full context when needed",
        ],
      },
      {
        icon: PackageCheck,
        title: "Courier Management",
        points: [
          "Orchestrate client orders across your courier network",
          "AI-assisted allocation and exception handling",
          "Unified view of orders, statuses and SLAs",
          "Built for 3PLs and multi-carrier operations",
        ],
      },
    ],
  },
];

const colorMap: Record<string, { badge: string; icon: string; dot: string }> = {
  sky:     { badge: "border-sky-400/20 bg-sky-400/10 text-sky-300",       icon: "border-sky-400/20 bg-sky-400/10 text-sky-300",       dot: "bg-sky-400" },
  indigo:  { badge: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300", icon: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300", dot: "bg-indigo-400" },
  emerald: { badge: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300", icon: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
  violet:  { badge: "border-violet-400/20 bg-violet-400/10 text-violet-300",   icon: "border-violet-400/20 bg-violet-400/10 text-violet-300",   dot: "bg-violet-400" },
  amber:   { badge: "border-amber-400/20 bg-amber-400/10 text-amber-300",     icon: "border-amber-400/20 bg-amber-400/10 text-amber-300",     dot: "bg-amber-400" },
  cyan:    { badge: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",        icon: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",        dot: "bg-cyan-400" },
  rose:    { badge: "border-rose-400/20 bg-rose-400/10 text-rose-300",        icon: "border-rose-400/20 bg-rose-400/10 text-rose-300",        dot: "bg-rose-400" },
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />
      <div className="pt-24 pb-8 text-center px-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
          <Zap className="h-3.5 w-3.5 text-sky-400" /> Full Feature List
        </div>
        <h1 className="text-5xl font-black text-white mb-4">
          Everything your team needs
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto">
          Built for South African courier and freight-forwarding operations —
          from waybill to invoice, driver to depot, cash to reconciliation, with
          decision intelligence on every department.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-12 space-y-20">
        {sections.map((sec) => {
          const c = colorMap[sec.color];
          return (
            <div key={sec.label}>
              <div className={`mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${c.badge}`}>
                {sec.label}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sec.features.map(({ icon: Icon, title, points }) => (
                  <div
                    key={title}
                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-7 hover:border-white/20 transition-all"
                  >
                    <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${c.icon}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-black text-white mb-4">{title}</h3>
                    <ul className="space-y-2.5">
                      {points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm text-white/60">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400/70" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="border-t border-white/5 py-20 text-center px-6">
        <h2 className="text-4xl font-black text-white mb-4">Start using all of this today</h2>
        <p className="text-white/50 mb-8">14-day free trial · No credit card · ZAR billing</p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 text-base font-black text-white hover:bg-sky-400 transition-colors"
        >
          Start Free Trial <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
      <PublicFooter />
    </div>
  );
}
