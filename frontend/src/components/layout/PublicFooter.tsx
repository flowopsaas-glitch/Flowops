import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";

const WA_NUMBER = "27814065725";

const footerLinks = {
  Product: [
    { label: "Features", to: "/features" },
    { label: "Pricing", to: "/pricing" },
    { label: "Track a Parcel", to: "/track" },
    { label: "Sign Up", to: "/signup" },
  ],
  Platform: [
    { label: "Login", to: "/login" },
    { label: "Owner Console", to: "/owner/dashboard" },
    { label: "Driver Portal", to: "/driver/portal" },
  ],
  Legal: [
    { label: "Terms of Service", to: "/legal/terms" },
    { label: "Privacy Policy", to: "/legal/privacy" },
  ],
};

export default function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#040d1a]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <img
                src="/flowops-logo.png"
                alt="FlowOps"
                className="h-9 w-9 rounded-xl object-cover border border-sky-400/20"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span className="text-lg font-black tracking-tight text-white">
                Flow<span className="text-sky-400">Ops</span>
              </span>
            </Link>
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              The logistics management platform built for South African courier
              and freight companies.
            </p>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Us
            </a>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, items]) => (
            <div key={section}>
              <h4 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-white/30">
                {section}
              </h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <p>© {new Date().getFullYear()} FlowOps. All rights reserved. Built for South Africa 🇿🇦</p>
          <p>
            Questions?{" "}
            <a
              href="mailto:FlowOps2@proton.me"
              className="text-sky-400/60 hover:text-sky-400 transition-colors"
            >
              FlowOps2@proton.me
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
