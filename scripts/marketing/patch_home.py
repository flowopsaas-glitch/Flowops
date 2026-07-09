"""
FlowOps Home.tsx — Surgical Upgrade
Run: python3 /tmp/patch_home.py  (from ~/FlowOps-Logistics/flowops-web)
"""
import pathlib, sys

WA = "27814065725"
p = pathlib.Path('/home/kakes/FlowOps-Logistics/flowops-web/client/src/pages/Home.tsx')
if not p.exists():
    sys.exit('File not found: ' + str(p))

c = p.read_text()
n = 0  # change counter

# 1. Add MessageCircle import
if 'MessageCircle' not in c:
    c = c.replace(
        'import { \n  CheckCircle, Sparkles, Search, Cpu, Menu, X, ArrowRight\n} from "lucide-react";',
        'import { \n  CheckCircle, Sparkles, Search, Cpu, Menu, X, ArrowRight, MessageCircle\n} from "lucide-react";'
    ); n += 1

# 2. Add openWA helper
if 'openWA' not in c:
    c = c.replace(
        '  const handleEmailSubmit',
        '  const openWA = (msg) => window.open("https://wa.me/' + WA + '?text=" + encodeURIComponent(msg), "_blank");\n\n  const handleEmailSubmit'
    ); n += 1

# 3. Navbar: add Book Demo button
OLD_NAV_BTN = '            <button onClick={() => setLocation(\'/signup\')} className="bg-[#00d9ff] text-[#0a0e27] px-6 py-2.5 rounded-xl font-bold hover:bg-white transition-all shadow-[0_0_25px_rgba(0,217,255,0.4)]">\n              Client Portal\n            </button>'
NEW_NAV_BTN = '            <button onClick={() => openWA("Hi! I\'d like to book a FlowOps demo.")} className="hidden lg:flex items-center gap-2 text-emerald-400 border border-emerald-500/30 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-500/10 transition-all">\n              <MessageCircle size={14}/> Book Demo\n            </button>\n            <button onClick={() => setLocation(\'/signup\')} className="bg-[#00d9ff] text-[#0a0e27] px-6 py-2.5 rounded-xl font-bold hover:bg-white transition-all shadow-[0_0_25px_rgba(0,217,255,0.4)]">\n              Client Portal\n            </button>'
if 'Book Demo' not in c and OLD_NAV_BTN in c:
    c = c.replace(OLD_NAV_BTN, NEW_NAV_BTN); n += 1

# 4. Mystery feature list
OLD_LIST = '              {["Real-time Stock Levels", "Automated Reordering", "Digital Inbound/Outbound"].map((item, i) => ('
NEW_LIST = '              {["Intelligence that sees around corners.", "A system that acts before you ask.", "Operations that run themselves at scale."].map((item, i) => ('
if OLD_LIST in c:
    c = c.replace(OLD_LIST, NEW_LIST); n += 1

# 5. Mystery feature heading
OLD_H = '<h3 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight">End-to-End Visibility</h3>\n            <p className="text-slate-400 text-base sm:text-lg leading-relaxed">\n              Replace manual counts with real-time tablet scanning. Our Warehouse OS syncs stock levels directly to your billing engine.\n            </p>'
NEW_H = '<h3 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight">Something Big is Running.</h3>\n            <p className="text-slate-400 text-base sm:text-lg leading-relaxed">\n              We built a platform so intelligent, most of what it does happens silently \u2014 ahead of the problem. Your team will notice the difference. Your competitors won\'t understand why.\n            </p>'
if OLD_H in c:
    c = c.replace(OLD_H, NEW_H); n += 1


# 6. Fix pricing to match actual app + WhatsApp CTAs
OLD_PRICE = '''            {[
              { plan: "Starter", price: "R1,500", desc: "For small fleets" }, 
              { plan: "Professional", price: "R8,500", desc: "For growing logistics", popular: true }, 
              { plan: "Enterprise", price: "R17,000", desc: "Full AI integration" }
            ].map((p, i) => (
              <div 
                key={i} 
                className={`relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl border transition-all duration-300 hover:-translate-y-1 sm:hover:-translate-y-2 ${
                  p.popular 
                    ? 'bg-gradient-to-b from-[#00d9ff]/10 to-transparent border-[#00d9ff]/50 shadow-[0_0_40px_rgba(0,217,255,0.15)]' 
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 bg-[#00d9ff] text-[#0a0e27] text-[10px] sm:text-xs font-black uppercase tracking-widest px-3 sm:px-4 py-1 rounded-full shadow-lg">
                    Most Popular
                  </div>
                )}
                <p className="text-slate-500 font-bold text-[10px] sm:text-xs uppercase tracking-widest mt-1 sm:mt-2">{p.plan}</p>
                <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white mt-3 sm:mt-4">
                  {p.price}
                  <span className="text-base sm:text-lg text-slate-500 font-normal">/mo</span>
                </p>
                <p className="text-slate-500 text-sm mt-1 sm:mt-2">{p.desc}</p>
                <button 
                  onClick={() => setLocation('/pricing')} 
                  className={`mt-6 sm:mt-8 w-full py-3 sm:py-4 rounded-xl font-bold text-[10px] sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${
                    p.popular 
                      ? 'bg-[#00d9ff] text-[#0a0e27] hover:bg-white' 
                      : 'border border-white/20 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Get Started <ArrowRight size={12} className="sm:size-16" />
                </button>
              </div>
            ))}'''

NEW_PRICE = '''            {[
              { plan: "Starter",      price: "Free",    sub: "",    desc: "Up to 100 waybills/month",  pop: false, cta: "Start Free",    msg: "Hi! I want to start on the FlowOps Starter (free) plan." },
              { plan: "Professional", price: "R19,999", sub: "/mo", desc: "Unlimited waybills + AI",   pop: true,  cta: "Upgrade Now",   msg: "Hi! I want to upgrade to FlowOps Professional at R19,999/mo." },
              { plan: "Enterprise",   price: "Custom",  sub: "",    desc: "White-label + custom SLA",  pop: false, cta: "Contact Sales", msg: "Hi! I want to discuss FlowOps Enterprise pricing for my organisation." },
            ].map((pl, i) => (
              <div
                key={i}
                className={`relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl border transition-all duration-300 hover:-translate-y-1 sm:hover:-translate-y-2 ${
                  pl.pop
                    ? 'bg-gradient-to-b from-[#00d9ff]/10 to-transparent border-[#00d9ff]/50 shadow-[0_0_40px_rgba(0,217,255,0.15)]'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {pl.pop && (
                  <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 bg-[#00d9ff] text-[#0a0e27] text-[10px] sm:text-xs font-black uppercase tracking-widest px-3 sm:px-4 py-1 rounded-full shadow-lg">
                    Most Popular
                  </div>
                )}
                <p className="text-slate-500 font-bold text-[10px] sm:text-xs uppercase tracking-widest mt-1 sm:mt-2">{pl.plan}</p>
                <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white mt-3 sm:mt-4">
                  {pl.price}<span className="text-base sm:text-lg text-slate-500 font-normal">{pl.sub}</span>
                </p>
                <p className="text-slate-500 text-sm mt-1 sm:mt-2">{pl.desc}</p>
                <button
                  onClick={() => openWA(pl.msg)}
                  className={`mt-6 sm:mt-8 w-full py-3 sm:py-4 rounded-xl font-bold text-[10px] sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${
                    pl.pop
                      ? 'bg-[#00d9ff] text-[#0a0e27] hover:bg-white'
                      : 'border border-white/20 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <MessageCircle size={12}/> {pl.cta}
                </button>
              </div>
            ))}'''

if OLD_PRICE in c:
    c = c.replace(OLD_PRICE, NEW_PRICE); n += 1


# 7. Fix broken CTA button
OLD_CTA = "                Get Desktop App"
NEW_CTA = "                <MessageCircle size={20}/> Get Started on WhatsApp"
OLD_CTA_BTN = "                onClick={() => setLocation('/signup')} \n                className=\"bg-[#00d9ff]"
NEW_CTA_BTN = "                onClick={() => openWA('Hi! I want to start using FlowOps for my courier business. Can we set up a call?')} \n                className=\"bg-[#00d9ff]"
if OLD_CTA in c:
    c = c.replace(OLD_CTA, NEW_CTA); n += 1
if OLD_CTA_BTN in c:
    c = c.replace(OLD_CTA_BTN, NEW_CTA_BTN, 1); n += 1

# 8. Insert new sections + update footer before old footer
OLD_FOOTER_ANCHOR = '      {/* Footer */}\n      <footer className="py-10 sm:py-12'
if OLD_FOOTER_ANCHOR in c:
    NEW_SECTIONS = (
        "\n"
        "      {/* CAPABILITY TEASERS */}\n"
        "      <section className=\"py-24 sm:py-32 px-4 sm:px-6 bg-white/[0.01]\">\n"
        "        <div className=\"max-w-7xl mx-auto text-center mb-16\">\n"
        "          <p className=\"text-[#00d9ff] text-xs font-black uppercase tracking-[0.3em] mb-4\">The Platform</p>\n"
        "          <h2 className=\"text-3xl sm:text-5xl font-black uppercase tracking-tight\">You'll wonder how you managed without it.</h2>\n"
        "          <p className=\"text-slate-400 mt-4 max-w-2xl mx-auto\">We won't tell you everything it does. Some things are better experienced.</p>\n"
        "        </div>\n"
        "        <div className=\"max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6\">\n"
        "          {[\n"
        "            { icon: '\u26a1', title: 'Fleet intelligence that never sleeps.', desc: 'Your fleet is always moving. So is our engine.' },\n"
        "            { icon: '\U0001f9e0', title: 'AI that thinks ahead of the problem.', desc: 'By the time you notice an issue, it is already resolved.' },\n"
        "            { icon: '\U0001f4e6', title: 'Every parcel. Every driver. One view.', desc: 'No gaps. No spreadsheets. No chasing.' },\n"
        "            { icon: '\U0001f4b0', title: 'Cash that reconciles itself.', desc: 'COD. Invoices. Payments. Done automatically.' },\n"
        "            { icon: '\U0001f5fa\ufe0f', title: 'Routes that adapt in real time.', desc: 'Traffic, load, capacity - the optimal path, always.' },\n"
        "            { icon: '\U0001f512', title: 'Enterprise-grade. SA-priced.', desc: 'World-class tech built for South African operations.' },\n"
        "          ].map((f, i) => (\n"
        "            <div key={i} className=\"group bg-white/[0.03] border border-white/8 rounded-3xl p-7 hover:bg-white/[0.06] hover:border-[#00d9ff]/20 transition-all duration-300\">\n"
        "              <div className=\"text-3xl mb-4\">{f.icon}</div>\n"
        "              <h3 className=\"text-lg font-black text-white mb-2 group-hover:text-[#00d9ff] transition-colors\">{f.title}</h3>\n"
        "              <p className=\"text-sm text-slate-400 leading-relaxed\">{f.desc}</p>\n"
        "            </div>\n"
        "          ))}\n"
        "        </div>\n"
        "      </section>\n"
        "\n"
        "      {/* WAREHOUSING COMING SOON */}\n"
        "      <section className=\"py-24 px-4 sm:px-6 relative overflow-hidden\">\n"
        "        <div className=\"absolute inset-0 bg-gradient-to-r from-violet-600/5 via-fuchsia-500/5 to-pink-600/5 pointer-events-none\"/>\n"
        "        <div className=\"max-w-4xl mx-auto relative text-center space-y-6\">\n"
        "          <div className=\"inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-violet-300 text-xs font-black uppercase tracking-[0.25em]\">\n"
        "            \U0001f3ed Launching Soon\n"
        "          </div>\n"
        "          <h2 className=\"text-4xl sm:text-6xl font-black uppercase tracking-tighter\">FlowOps<br/><span className=\"text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400\">Warehousing.</span></h2>\n"
        "          <p className=\"text-lg text-slate-400 max-w-xl mx-auto leading-relaxed\">The same intelligence that runs your fleet - now inside your warehouse. Stock. Binning. Pick &amp; pack. All connected to your courier operations.</p>\n"
        "          <div className=\"bg-white/[0.03] border border-violet-500/20 rounded-3xl p-8 mt-8 max-w-lg mx-auto\">\n"
        "            <p className=\"text-sm text-slate-400 mb-4 font-bold uppercase tracking-wider\">Be first to know when it drops.</p>\n"
        "            <button onClick={() => openWA('Hi! I want to join the FlowOps Warehousing waitlist. Please notify me when it launches.')} className=\"w-full flex items-center justify-center gap-2 bg-violet-500/20 border border-violet-500/30 text-violet-300 py-4 rounded-2xl font-black hover:bg-violet-500/30 transition\">\n"
        "              <MessageCircle size={16}/> Join Warehousing Waitlist on WhatsApp\n"
        "            </button>\n"
        "          </div>\n"
        "        </div>\n"
        "      </section>\n"
        "\n"
        "      {/* CUSTOM SOFTWARE */}\n"
        "      <section className=\"py-24 px-4 sm:px-6\">\n"
        "        <div className=\"max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center\">\n"
        "          <div className=\"space-y-6\">\n"
        "            <div className=\"inline-flex items-center gap-2 px-4 py-1.5 bg-[#ff006e]/10 border border-[#ff006e]/30 rounded-full text-[#ff006e] text-xs font-black uppercase tracking-[0.25em]\">\U0001f6e0 Software Studio</div>\n"
        "            <h2 className=\"text-4xl sm:text-5xl font-black uppercase tracking-tighter\">We also build<br/><span className=\"text-[#ff006e]\">custom software.</span></h2>\n"
        "            <p className=\"text-slate-400 text-lg leading-relaxed\">Have a unique ops challenge that off-the-shelf software cannot solve? We build purpose-built applications - from internal tools to customer-facing platforms.</p>\n"
        "            <ul className=\"space-y-3 pt-2\">\n"
        "              {['Logistics and fleet management systems','Client portals and booking platforms','Billing and invoice automation','WhatsApp business automation','Custom dashboards and reporting'].map((item, i) => (\n"
        "                <li key={i} className=\"flex items-center gap-3 text-slate-300 text-sm\"><div className=\"h-1.5 w-1.5 rounded-full bg-[#ff006e] flex-shrink-0\"/>{item}</li>\n"
        "              ))}\n"
        "            </ul>\n"
        "            <button onClick={() => openWA('Hi! I have a custom software project I would like to discuss with your team.')} className=\"inline-flex items-center gap-2 bg-[#ff006e] text-white px-8 py-4 rounded-2xl font-black hover:bg-[#ff006e]/80 transition-all shadow-[0_0_25px_rgba(255,0,110,0.3)]\">\n"
        "              <MessageCircle size={16}/> Discuss Your Project\n"
        "            </button>\n"
        "          </div>\n"
        "          <div className=\"bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] border border-[#ff006e]/15 rounded-3xl p-8 space-y-4\">\n"
        "            {['Discovery and scoping','Rapid prototyping','Agile development','Testing and QA','Deployment and handover'].map((step, i) => (\n"
        "              <div key={i} className=\"flex items-center gap-4\">\n"
        "                <div className=\"h-8 w-8 rounded-full bg-[#ff006e]/10 border border-[#ff006e]/20 text-[#ff006e] text-xs font-black flex items-center justify-center flex-shrink-0\">{i+1}</div>\n"
        "                <div className=\"flex-1 h-px bg-white/5\"/>\n"
        "                <span className=\"text-slate-300 text-sm font-medium\">{step}</span>\n"
        "              </div>\n"
        "            ))}\n"
        "          </div>\n"
        "        </div>\n"
        "      </section>\n"
        "\n"
    )
    c = c.replace(OLD_FOOTER_ANCHOR, NEW_SECTIONS + OLD_FOOTER_ANCHOR); n += 1

# 9. Update footer links
OLD_FOOTER_LINKS = '          <div className="flex gap-4 sm:gap-6 text-slate-500 text-xs sm:text-sm">\n            <a href="#" className="hover:text-[#00d9ff] transition-colors">LinkedIn</a>\n            <a href="#" className="hover:text-[#00d9ff] transition-colors">Docs</a>\n          </div>'
NEW_FOOTER_LINKS = ('          <div className="flex flex-wrap gap-4 sm:gap-6 text-slate-500 text-xs sm:text-sm items-center">\n'
    '            <a href="#features" className="hover:text-[#00d9ff] transition-colors">Solutions</a>\n'
    '            <a href="/pricing" className="hover:text-[#00d9ff] transition-colors">Pricing</a>\n'
    '            <button onClick={() => window.open("https://wa.me/' + WA + '", "_blank")} className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors font-bold">\n'
    '              <MessageCircle size={13}/> +27 81 406 5725\n'
    '            </button>\n'
    '          </div>')
if OLD_FOOTER_LINKS in c:
    c = c.replace(OLD_FOOTER_LINKS, NEW_FOOTER_LINKS); n += 1

# 10. Update footer copyright
c = c.replace(
    '            2026 FlowOps SA. All rights reserved.',
    '            \u00a9 2026 FlowOps SA. All rights reserved. \U0001f1ff\U0001f1e6'
); n += 1

p.write_text(c)
print(f'Done - {n} changes applied to {p}')
