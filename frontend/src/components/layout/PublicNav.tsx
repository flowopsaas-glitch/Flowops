import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Features", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Track Parcel", to: "/track" },
];

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[#07111f]/90 backdrop-blur-xl shadow-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
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

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  pathname === l.to
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-black text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden rounded-xl border border-white/10 bg-white/5 p-2 text-white"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-[#07111f]/95 backdrop-blur-xl px-6 py-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <Link
              to="/login"
              className="block rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white/70"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="block rounded-xl bg-sky-500 px-4 py-3 text-center text-sm font-black text-white"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
