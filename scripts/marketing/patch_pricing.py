"""
FlowOps Pricing.tsx — Surgical Upgrade
Run: python3 /tmp/patch_pricing.py  (from ~/FlowOps-Logistics/flowops-web)
"""
import pathlib, sys

WA = "27814065725"
p = pathlib.Path('/home/kakes/FlowOps-Logistics/flowops-web/client/src/pages/Pricing.tsx')
if not p.exists():
    sys.exit('Not found: ' + str(p))

c = p.read_text()
n = 0

# 1. Replace old pricing data with correct pricing + WhatsApp CTAs
OLD_PLANS = '''const pricingPlans = [
  {
    name: "Starter",
    description: "Perfect for small logistics teams",
    monthlyPrice: 1500,
    popular: false,
    features: ["Up to 100 shipments/month", "Real-time tracking", "Basic automation", "Email support", "Mobile app access"],
    notIncluded: ["Desktop App download", "Advanced analytics", "Priority support"],
    cta: "Start Free Trial",
  },
  {
    name: "Professional",
    description: "R8000 platform + R500 per active user",
    monthlyPrice: 8500,
    popular: true,
    features: ["Unlimited shipments", "R500 per additional user", "Real-time tracking", "Advanced automation", "Priority support", "Mobile app access"],
    notIncluded: ["No Desktop App download", "Dedicated account manager"],
    cta: "Get Started",
  },
  {
    name: "Enterprise",
    description: "For large-scale operations",
    monthlyPrice: 17000,
    popular: false,
    features: ["Unlimited users included", "Download Desktop App", "Full FlowOps Platform access", "24/7 priority support", "Advanced analytics", "Custom integrations", "White-label solution"],
    notIncluded: [],
    cta: "Contact Sales",
  },
];'''

NEW_PLANS = (
    'const WA_NUM = "' + WA + '";\n'
    'const openWA = (msg: string) => window.open("https://wa.me/" + WA_NUM + "?text=" + encodeURIComponent(msg), "_blank");\n\n'
    'const pricingPlans = [\n'
    '  {\n'
    '    name: "Starter",\n'
    '    description: "Get started — no credit card needed",\n'
    '    price: "Free",\n'
    '    sub: "",\n'
    '    popular: false,\n'
    '    features: ["Up to 100 waybills/month", "3 driver accounts", "Live tracking dashboard", "WhatsApp status updates", "Mobile driver portal"],\n'
    '    notIncluded: ["AI dispatch engine", "Route optimizer", "COD reconciliation", "Unlimited drivers"],\n'
    '    cta: "Start for Free",\n'
    '    msg: "Hi! I want to start on the FlowOps Starter plan (free). Please help me get set up.",\n'
    '  },\n'
    '  {\n'
    '    name: "Professional",\n'
    '    description: "The full FlowOps platform — no limits",\n'
    '    price: "R14,999",\n'
    '    sub: "/mo",\n'
    '    popular: true,\n'
    '    features: ["Unlimited waybills", "Unlimited driver accounts", "AI dispatch engine", "Route optimizer", "COD reconciliation", "WhatsApp & Email hub", "Webhook & API access", "Priority support"],\n'
    '    notIncluded: ["Dedicated account manager"],\n'
    '    cta: "Upgrade to Pro",\n'
    '    msg: "Hi! I want to upgrade to FlowOps Professional at R14,999/mo. Please send me a payment link.",\n'
    '  },\n'
    '  {\n'
    '    name: "Enterprise",\n'
    '    description: "White-label + custom SLA for large operations",\n'
    '    price: "Custom",\n'
    '    sub: "",\n'
    '    popular: false,\n'
    '    features: ["Everything in Professional", "Unlimited drivers", "White-label branding", "Custom SLA targets", "Dedicated onboarding", "Multi-branch support", "Custom integrations", "24/7 priority support"],\n'
    '    notIncluded: [],\n'
    '    cta: "Contact Sales",\n'
    '    msg: "Hi! I want to discuss FlowOps Enterprise pricing for my organisation. Can we schedule a call?",\n'
    '  },\n'
    '];'
)

if OLD_PLANS in c:
    c = c.replace(OLD_PLANS, NEW_PLANS); n += 1

# 2. Replace handleSelection with openWA
OLD_SELECT = '''  const handleSelection = (planName: string) => {
    // Navigates using wouter to the signup route
    setLocation(`/signup?plan=${encodeURIComponent(planName)}`);
  };'''
NEW_SELECT = '''  // Plans now route to WhatsApp — handled per-plan in pricingPlans array
  const handleSelection = (plan: any) => openWA(plan.msg);'''
if OLD_SELECT in c:
    c = c.replace(OLD_SELECT, NEW_SELECT); n += 1

# 3. Fix the price display in the plan cards (monthlyPrice → price/sub)
OLD_PRICE_DISPLAY = '''                <div className="text-4xl font-black text-white">
                  R{plan.monthlyPrice.toLocaleString()}
                  <span className="text-lg font-normal text-slate-400">/month</span>
                </div>'''
NEW_PRICE_DISPLAY = '''                <div className="text-4xl font-black text-white">
                  {plan.price}
                  <span className="text-lg font-normal text-slate-400">{(plan as any).sub}</span>
                </div>'''
if OLD_PRICE_DISPLAY in c:
    c = c.replace(OLD_PRICE_DISPLAY, NEW_PRICE_DISPLAY); n += 1

# 4. Fix CTA button onClick
OLD_BTN = '              onClick={() => handleSelection(plan.name)}'
NEW_BTN = '              onClick={() => handleSelection(plan as any)}'
if OLD_BTN in c:
    c = c.replace(OLD_BTN, NEW_BTN); n += 1

# 5. Add MessageCircle import if missing
if 'MessageCircle' not in c:
    c = c.replace(
        'import { Check, ArrowRight, Star, MonitorOff, Download } from "lucide-react";',
        'import { Check, ArrowRight, Star, MonitorOff, Download, MessageCircle } from "lucide-react";'
    ); n += 1

# 6. Add a coming-soon teaser before the final closing div of the pricing section
TEASE = (
    '\n      {/* WAREHOUSING TEASER */}\n'
    '      <section className="py-16 px-4 text-center">\n'
    '        <div className="max-w-2xl mx-auto bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-3xl p-8">\n'
    '          <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-500/15 border border-violet-500/30 rounded-full text-violet-300 text-xs font-black uppercase tracking-widest mb-4">\n'
    '            \U0001f3ed Coming Soon\n'
    '          </div>\n'
    '          <h3 className="text-2xl font-black text-white mb-3">FlowOps Warehousing is on its way.</h3>\n'
    '          <p className="text-slate-400 text-sm mb-6">The same platform intelligence — now covering your entire warehouse operation. Join the waitlist and be first in line.</p>\n'
    '          <button onClick={() => openWA("Hi! I want to join the FlowOps Warehousing waitlist.")} className="inline-flex items-center gap-2 bg-violet-500/20 border border-violet-500/30 text-violet-300 px-6 py-3 rounded-2xl font-black hover:bg-violet-500/30 transition text-sm">\n'
    '            <MessageCircle size={14}/> Join Waitlist on WhatsApp\n'
    '          </button>\n'
    '        </div>\n'
    '      </section>\n'
)

# Insert before the footer nav
FOOTER_NAV = '      <nav className="sticky top-0 z-50'
if FOOTER_NAV in c and 'Warehousing' not in c:
    c = c.replace(FOOTER_NAV, TEASE + '      <nav className="sticky top-0 z-50', 1); n += 1

p.write_text(c)
print(f'Done - {n} changes applied to {p}')
