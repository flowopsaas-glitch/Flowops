"""
FlowOps Home.tsx — Surgical Upgrade (preserves existing design)
Run from ~/FlowOps-Logistics/flowops-web:  python3 /tmp/patch_home.py
"""
import pathlib, sys

WA = "27814065725"

p = pathlib.Path('/home/kakes/FlowOps-Logistics/flowops-web/client/src/pages/Home.tsx')
if not p.exists():
    sys.exit(f'Not found: {p}')

c = p.read_text()
changes = 0

# ── 1. Add MessageCircle to imports ─────────────────────────────────────────
old = '''import { 
  CheckCircle, Sparkles, Search, Cpu, Menu, X, ArrowRight
} from "lucide-react";'''
new = '''import { 
  CheckCircle, Sparkles, Search, Cpu, Menu, X, ArrowRight, MessageCircle
} from "lucide-react";'''
if old in c: c = c.replace(old, new, 1); changes += 1

# ── 2. Add openWA helper after useLocation ───────────────────────────────────
old = '''  const handleEmailSubmit'''
new = f'''  const openWA = (msg: string) => window.open(`https://wa.me/{WA}?text=${{encodeURIComponent(msg)}}`, '_blank');

  const handleEmailSubmit'''
if 'openWA' not in c and old in c: c = c.replace(old, new, 1); changes += 1

# ── 3. Add Book Demo to desktop nav (before Client Portal button) ────────────
old = '''            <button onClick={() => setLocation('/signup')} className="bg-[#00d9ff] text-[#0a0e27] px-6 py-2.5 rounded-xl font-bold hover:bg-white transition-all shadow-[0_0_25px_rgba(0,217,255,0.4)]">
              Client Portal
            </button>'''
new = '''            <button onClick={() => openWA('Hi! I\\'d like to book a FlowOps demo for my courier business.')} className="hidden lg:flex items-center gap-2 text-emerald-400 border border-emerald-500/30 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-500/10 transition-all">
              <MessageCircle size={14}/> Book Demo
            </button>
            <button onClick={() => setLocation('/signup')} className="bg-[#00d9ff] text-[#0a0e27] px-6 py-2.5 rounded-xl font-bold hover:bg-white transition-all shadow-[0_0_25px_rgba(0,217,255,0.4)]">
              Client Portal
            </button>'''
if 'Book Demo' not in c and old in c: c = c.replace(old, new, 1); changes += 1

# ── 4. Replace revealing feature list with teaser copy ───────────────────────
old = '''            <ul className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
              {["Real-time Stock Levels", "Automated Reordering", "Digital Inbound/Outbound"].map((item, i) => (
                <li key={i} className="flex items-start sm:items-center gap-2 sm:gap-3 text-[#00d9ff]/80 font-medium text-base sm:text-lg">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-[#00d9ff]/30 bg-[#00d9ff]/10 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                    <CheckCircle size={12} className="sm:size-14" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>'''
new = '''            <ul className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
              {["Intelligence that sees around corners.", "A system that acts — before you ask.", "Operations that run themselves at scale."].map((item, i) => (
                <li key={i} className="flex items-start sm:items-center gap-2 sm:gap-3 text-[#00d9ff]/80 font-medium text-base sm:text-lg">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-[#00d9ff]/30 bg-[#00d9ff]/10 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                    <CheckCircle size={12} className="sm:size-14" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>'''
if old in c: c = c.replace(old, new, 1); changes += 1

# ── 5. Replace revealing feature heading with teaser ─────────────────────────
old = '''            <h3 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight">End-to-End Visibility</h3>
            <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
              Replace manual counts with real-time tablet scanning. Our Warehouse OS syncs stock levels directly to your billing engine.
            </p>'''
new = '''            <h3 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight">Something Big is Running.</h3>
            <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
              We built a platform so intelligent, most of what it does happens silently — behind the scenes, ahead of the problem. Your team will notice the difference. Your competitors won't understand why.
            </p>'''
if old in c: c = c.replace(old, new, 1); changes += 1

# ── 6. Fix pricing (match actual app) + wire WhatsApp ────────────────────────
old = '''          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-8 sm:pt-12">
            {[
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
            ))}
          </div>'''
new = '''          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-8 sm:pt-12">
            {([
              { plan: "Starter", price: "Free", sub: "", desc: "Up to 100 waybills/month", popular: false, cta: "Start Free", msg: "Hi! I want to start the FlowOps Starter (free) plan." },
              { plan: "Professional", price: "R14,999", sub: "/mo", desc: "Unlimited waybills + AI dispatch", popular: true, cta: "Upgrade Now", msg: "Hi! I want to upgrade to FlowOps Professional at R14,999/mo." },
              { plan: "Enterprise", price: "Custom", sub: "", desc: "White-label + custom SLA", popular: false, cta: "Contact Sales", msg: "Hi! I want to discuss the FlowOps Enterprise plan for my organisation." },
            ] as const).map((p, i) => (
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
                  {p.price}<span className="text-base sm:text-lg text-slate-500 font-normal">{p.sub}</span>
                </p>
                <p className="text-slate-500 text-sm mt-1 sm:mt-2">{p.desc}</p>
                <button
                  onClick={() => openWA(p.msg)}
                  className={`mt-6 sm:mt-8 w-full py-3 sm:py-4 rounded-xl font-bold text-[10px] sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${
                    p.popular
                      ? 'bg-[#00d9ff] text-[#0a0e27] hover:bg-white'
                      : 'border border-white/20 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <MessageCircle size={12}/> {p.cta}
                </button>
              </div>
            ))}
          </div>'''
if old in c: c = c.replace(old, new, 1); changes += 1

# ── 7. Replace broken "Get Desktop App" CTA with WhatsApp ────────────────────
old = '''              <button 
                onClick={() => setLocation('/signup')} 
                className="bg-[#00d9ff] text-[#0a0e27] px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-xl hover:bg-white transition-all flex items-center gap-2 sm:gap-3 justify-center shadow-[0_0_30px_rgba(0,217,255,0.5)]"
              >
                Get Desktop App
              </button>'''
new = f'''              <button
                onClick={{() => openWA('Hi! I want to start using FlowOps for my courier business. Can we set up a call?')}}
                className="bg-[#00d9ff] text-[#0a0e27] px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-xl hover:bg-white transition-all flex items-center gap-2 sm:gap-3 justify-center shadow-[0_0_30px_rgba(0,217,255,0.5)]"
              >
                <MessageCircle size={{20}}/> Get Started on WhatsApp
              </button>'''
if old in c: c = c.replace(old, new, 1); changes += 1



# ── 8. Insert new sections + update footer before closing </div> ─────────────
NEW_SECTIONS = f'''
      {{/* ── CAPABILITY TEASERS ─────────────────────────── */}}
      <section className="py-24 sm:py-32 px-4 sm:px-6 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto text-center mb-16">
          <p className="text-[#00d9ff] text-xs font-black uppercase tracking-[0.3em] mb-4">The Platform</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight">You'll wonder how you managed without it.</h2>
          <p className="text-slate-400 mt-4 max-w-2xl mx-auto">We won't tell you everything it does. Some things are better experienced.</p>
        </div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {{[
            {{ icon: "⚡", title: "Fleet intelligence that never sleeps.", desc: "Your fleet is always moving. So is our engine." }},
            {{ icon: "🧠", title: "AI that thinks ahead of the problem.", desc: "By the time you notice an issue, it's already been resolved." }},
            {{ icon: "📦", title: "Every parcel. Every driver. One view.", desc: "No gaps. No spreadsheets. No chasing." }},
            {{ icon: "💰", title: "Cash that reconciles itself.", desc: "COD. Invoices. Payments. Done automatically." }},
            {{ icon: "🗺️", title: "Routes that adapt in real time.", desc: "Traffic, load, capacity — the optimal path, always." }},
            {{ icon: "🔒", title: "Enterprise-grade. SA-priced.", desc: "World-class tech built for South African operations." }},
          ]}.map((f, i) => (
            <div key={{i}} className="group bg-white/[0.03] border border-white/8 rounded-3xl p-7 hover:bg-white/[0.06] hover:border-[#00d9ff]/20 transition-all duration-300 cursor-default">
              <div className="text-3xl mb-4">{{f.icon}}</div>
              <h3 className="text-lg font-black text-white mb-2 group-hover:text-[#00d9ff] transition-colors">{{f.title}}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{{f.desc}}</p>
            </div>
          ))}
        </div>
      </section>

      {{/* ── FLOWOPS WAREHOUSING — COMING SOON ─────────── */}}
      <section className="py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 via-fuchsia-500/5 to-pink-600/5 pointer-events-none"/>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"/>
        <div className="max-w-4xl mx-auto relative">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-violet-300 text-xs font-black uppercase tracking-[0.25em]">
              🏭 Launching Soon
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter">FlowOps<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">Warehousing.</span></h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              The same intelligence that runs your fleet — now inside your warehouse. Stock. Binning. Pick & pack. All connected to your courier operations.
            </p>
            <div className="bg-white/[0.03] border border-violet-500/20 rounded-3xl p-8 mt-8 max-w-lg mx-auto">
              <p className="text-sm text-slate-400 mb-2 font-bold uppercase tracking-wider">Be first to know when it drops.</p>
              <button
                onClick={{() => window.open(`https://wa.me/{WA}?text=${{encodeURIComponent('Hi! I want to be notified when FlowOps Warehousing launches. Please add me to the waitlist.')}}`, '_blank')}}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-violet-500/20 border border-violet-500/30 text-violet-300 py-4 rounded-2xl font-black hover:bg-violet-500/30 transition"
              >
                <MessageCircle size={{16}}/> Join Warehousing Waitlist on WhatsApp
              </button>
            </div>
          </div>
        </div>
      </section>

      {{/* ── CUSTOM SOFTWARE ─────────────────────────────── */}}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#ff006e]/10 border border-[#ff006e]/30 rounded-full text-[#ff006e] text-xs font-black uppercase tracking-[0.25em]">
              🛠 Software Studio
            </div>
            <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter">We also build<br/><span className="text-[#ff006e]">custom software.</span></h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Have a unique ops challenge that off-the-shelf software can't solve? We build purpose-built applications — from internal tools to customer-facing platforms.
            </p>
            <ul className="space-y-3 pt-2">
              {{["Logistics & fleet management systems", "Client portals & booking platforms", "Billing & invoice automation", "WhatsApp business automation", "Custom dashboards & reporting"].map((item, i) => (
                <li key={{i}} className="flex items-center gap-3 text-slate-300 text-sm">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff006e] flex-shrink-0"/>{{item}}
                </li>
              ))}}
            </ul>
            <button
              onClick={{() => window.open(`https://wa.me/{WA}?text=${{encodeURIComponent('Hi! I have a custom software project I\\'d like to discuss with your team.')}}`, '_blank')}}
              className="inline-flex items-center gap-2 bg-[#ff006e] text-white px-8 py-4 rounded-2xl font-black hover:bg-[#ff006e]/80 transition-all shadow-[0_0_25px_rgba(255,0,110,0.3)]"
            >
              <MessageCircle size={{16}}/> Discuss Your Project
            </button>
          </div>
          <div className="relative">
            <div className="bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] border border-[#ff006e]/15 rounded-3xl p-8 space-y-4">
              {{["Discovery & scoping", "Rapid prototyping", "Agile development", "Testing & QA", "Deployment & handover"].map((step, i) => (
                <div key={{i}} className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-[#ff006e]/10 border border-[#ff006e]/20 text-[#ff006e] text-xs font-black flex items-center justify-center flex-shrink-0">{{i+1}}</div>
                  <div className="flex-1 h-px bg-white/5"/>
                  <span className="text-slate-300 text-sm font-medium">{{step}}</span>
                </div>
              ))}}
            </div>
          </div>
        </div>
      </section>
'''

old_footer = '''      {/* Footer */}
      <footer className="py-10 sm:py-12 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
          <a href="/" className="flex items-center gap-3" onClick={(e) => { e.preventDefault(); setLocation('/'); }}>
            <img src={logo} alt="FlowOps" className="h-7 sm:h-8 w-auto opacity-80" />
          </a>
          <p className="text-slate-600 text-xs sm:text-sm text-center sm:text-left">
            2026 FlowOps SA. All rights reserved.
          </p>
          <div className="flex gap-4 sm:gap-6 text-slate-500 text-xs sm:text-sm">
            <a href="#" className="hover:text-[#00d9ff] transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-[#00d9ff] transition-colors">Docs</a>
          </div>
        </div>
      </footer>'''

new_footer = f'''      {{/* Footer */}}
      <footer className="py-10 sm:py-12 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
          <a href="/" className="flex items-center gap-3" onClick={{(e) => {{ e.preventDefault(); setLocation('/'); }}}}>
            <img src={{logo}} alt="FlowOps" className="h-7 sm:h-8 w-auto opacity-80" />
          </a>
          <p className="text-slate-600 text-xs sm:text-sm text-center sm:text-left">
            © 2026 FlowOps SA. All rights reserved. 🇿🇦
          </p>
          <div className="flex flex-wrap gap-4 sm:gap-6 text-slate-500 text-xs sm:text-sm items-center justify-center">
            <a href="#features" className="hover:text-[#00d9ff] transition-colors">Solutions</a>
            <a href="/pricing" className="hover:text-[#00d9ff] transition-colors">Pricing</a>
            <button onClick={{() => window.open('https://wa.me/{WA}?text=Hi+FlowOps!', '_blank')}} className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors font-bold">
              <MessageCircle size={{13}}/> +27 81 406 5725
            </button>
          </div>
        </div>
      </footer>'''

INSERT_BEFORE = old_footer
if INSERT_BEFORE in c:
    c = c.replace(INSERT_BEFORE, NEW_SECTIONS + '\n' + new_footer, 1)
    changes += 1

p.write_text(c)
print(f'Done — {changes} changes applied to {p}')
