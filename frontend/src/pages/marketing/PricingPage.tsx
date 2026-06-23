import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight, MessageCircle, Zap } from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

const WA_NUMBER = "27814065725";

const plans = [
  {
    name: "Starter",
    price: "R 5,499",
    period: "/month",
    description: "Perfect for small courier teams getting started.",
    features: [
      "Up to 5 users",
      "Unlimited waybills",
      "Driver dispatch & GPS tracking",
      "Invoicing & rate cards",
      "WhatsApp click-to-chat",
      "14-day free trial",
    ],
    cta: "Start Free Trial",
    ctaTo: "/signup?plan=starter",
    highlight: false,
  },
  {
    name: "Professional",
    price: "R 14,999",
    period: "/month",
    description: "The full platform for growing operations.",
    features: [
      "Up to 20 users",
      "Everything in Starter",
      "COD reconciliation + driver wallets",
      "Multi-carrier rate shopping",
      "AI Control Tower",
      "Route optimisation",
      "Multi-branch support",
      "API keys & webhooks",
      "Shopify / WooCommerce connector",
    ],
    cta: "Start Free Trial",
    ctaTo: "/signup?plan=professional",
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large fleets and multi-company platforms.",
    features: [
      "Unlimited users",
      "Everything in Professional",
      "White-label branding",
      "Dedicated account manager",
      "Custom SLA & onboarding",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    ctaTo: null,
    highlight: false,
  },
];

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes — every plan starts with a 14-day free trial. No credit card required.",
  },
  {
    q: "Can I change plans later?",
    a: "Absolutely. You can upgrade or downgrade at any time. Billing adjusts from the next month.",
  },
  {
    q: "Is billing in ZAR?",
    a: "Yes. All pricing is in South African Rand and billed locally. No surprise currency conversions.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept card payments via Paystack. EFT available on request for annual plans.",
  },
  {
    q: "Do you offer discounts for NGOs or startups?",
    a: "Yes — contact us on WhatsApp and we'll work something out.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <PublicNav />

      {/* Header */}
      <div className="pt-24 pb-12 text-center px-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/50">
          <Zap className="h-3.5 w-3.5 text-sky-400" /> Transparent Pricing
        </div>
        <h1 className="text-5xl font-black text-white mb-4">
          Simple, ZAR pricing
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto">
          No setup fees. No hidden costs. Start free for 14 days — no card
          required.
        </p>
      </div>

      {/* Plans */}
      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-[28px] border p-8 ${
                plan.highlight
                  ? "border-sky-400/30 bg-gradient-to-b from-sky-500/10 via-sky-500/5 to-transparent shadow-xl shadow-sky-500/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-sky-400/30 bg-sky-500/20 px-4 py-1 text-xs font-black text-sky-300">
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-2xl font-black text-white mb-1">
                  {plan.name}
                </h2>
                <p className="text-sm text-white/40">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-black text-white">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-white/40 ml-1">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-3 flex-grow mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.ctaTo ? (
                <Link
                  to={plan.ctaTo}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black transition-colors ${
                    plan.highlight
                      ? "bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20"
                      : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20I'm%20interested%20in%20FlowOps%20Enterprise`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-6 py-3.5 text-sm font-black text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  {plan.cta}
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Flexible note */}
        <p className="mt-8 text-center text-sm text-white/30">
          Flexible pricing available for NGOs, government, and courier startups.
          Contact us on WhatsApp.
        </p>
      </div>

      {/* FAQ */}
      <div className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-black text-white text-center mb-12">
            Frequently asked questions
          </h2>
          <div className="space-y-5">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6"
              >
                <h3 className="font-black text-white mb-2">{f.q}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
