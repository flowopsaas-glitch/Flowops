import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { PRIVACY_SECTIONS } from "../../legal/termsSections";
import { termsSummaryLine } from "../../legal/termsAcceptance";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] text-white">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-200" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Privacy notice</h1>
              <p className="text-xs text-slate-400">POPIA-oriented · {termsSummaryLine()}</p>
            </div>
          </div>
          <Link
            to="/login"
            className="text-sm font-semibold text-blue-300 hover:text-blue-200"
          >
            Back to sign in
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">Draft — not legal advice.</strong>{" "}
          Canonical template:{" "}
          <code className="text-amber-50/90">legal/PRIVACY_NOTICE_POPIA.md</code>.
        </div>

        <article className="space-y-10 pb-16">
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-xl font-bold text-white mb-3">{section.title}</h2>
              <div className="space-y-3 text-slate-300 leading-relaxed">
                {section.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <footer className="border-t border-white/10 pt-8 pb-12 text-sm text-slate-400 flex flex-wrap gap-4">
          <Link to="/legal/terms" className="text-blue-300 hover:text-blue-200 font-medium">
            ← Terms of Service
          </Link>
        </footer>
      </div>
    </div>
  );
}
