import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Lock, Sparkles, ArrowRight } from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { persistTermsAcceptanceLocally } from "../legal/termsAcceptance";

export default function Signup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    password: "",
  });
  const [agreed, setAgreed] = useState(false);
  const { showToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      showToast("Please agree to the Terms of Service and Privacy Notice to continue.", "error");
      return;
    }

    persistTermsAcceptanceLocally();

    showToast("Signup submitted. Await admin approval.", "success");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] px-4 py-12 text-white flex items-center justify-center">
      <div className="w-full max-w-6xl grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            FlowOps onboarding
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              Request workspace access
            </h1>
            <p className="max-w-xl text-lg text-slate-300">
              Same premium shell as the tenant app: courier ops, billing, AI review, and comms
              hubs — provisioned for your team after approval.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-white">Tenant workspace</h3>
              <p className="mt-1 text-sm text-slate-400">
                Company-scoped users, inboxes, rate cards, and dispatch.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-white">Secure by design</h3>
              <p className="mt-1 text-sm text-slate-400">
                Terms acceptance stored; access gated until admin activation.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md justify-self-end rounded-[32px] border border-white/10 bg-[#09162f]/90 p-8 shadow-2xl backdrop-blur-xl space-y-5 lg:max-w-lg"
        >
          <div>
            <h2 className="text-3xl font-black tracking-tight">Create request</h2>
            <p className="mt-2 text-sm text-slate-300">
              We&apos;ll route this to your FlowOps administrator.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Full name
            </label>
            <input
              name="fullName"
              required
              value={form.fullName}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Work email
            </label>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Phone
            </label>
            <input
              name="phone"
              required
              value={form.phone}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="+27 …"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Company
            </label>
            <input
              name="company"
              required
              value={form.company}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Legal entity name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Min 8 characters"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/30 bg-[#071224] text-blue-400 focus:ring-blue-400/40"
            />
            <span>
              I agree to the{" "}
              <Link
                to="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Privacy Notice
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-500 py-4 font-bold text-slate-950 shadow-lg transition hover:brightness-110 active:scale-[0.99]"
          >
            Submit for approval
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>

          <p className="text-center text-sm text-slate-400">
            Already invited?{" "}
            <Link to="/login" className="font-semibold text-blue-300 hover:text-blue-200">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
