import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { TERMS_SECTIONS } from "../../legal/termsSections";
import { termsSummaryLine } from "../../legal/termsAcceptance";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] text-white">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-200" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Terms of Service</h1>
              <p className="text-xs text-slate-400">{termsSummaryLine()}</p>
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
          This page is a readable summary. Your counsel should review and amend the
          canonical markdown in the repository at{" "}
          <code className="text-amber-50/90">legal/TERMS_OF_SERVICE.md</code> before
          production reliance.
        </div>

        <nav className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">
            On this page
          </div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {TERMS_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-blue-200 hover:text-white underline-offset-2 hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="space-y-10 pb-16">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="text-xl font-bold text-white mb-3">{section.title}</h2>
              <div className="space-y-3 text-slate-300 leading-relaxed">
                {section.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <footer className="border-t border-white/10 pt-8 pb-12 text-sm text-slate-400">
          <Link to="/legal/privacy" className="text-blue-300 hover:text-blue-200 font-medium">
            Privacy notice (POPIA) →
          </Link>
        </footer>
      </div>
    </div>
  );
}
