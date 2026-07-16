/**
 * Mobile-first multi-step signup with DUAL verification:
 *   - WhatsApp OTP (primary)
 *   - Email OTP (fallback — works even when Meta WhatsApp is pending)
 *
 * Flow: Choose Method → Enter Phone/Email → OTP verify → Name + Company → Done
 *
 * Styled like WhatsApp's own onboarding — clean, minimal, step-by-step.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, CheckCircle2, MessageCircle, Shield, User, Building2, Mail } from "lucide-react";
import { api } from "../api/client";

type Step = "method" | "phone" | "otp" | "profile" | "done";
type VerifyMethod = "whatsapp" | "email";

export default function SignupMobile() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<VerifyMethod>("email");
  const [phone, setPhone] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Start countdown timer for resend
  function startCountdown() {
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  // Step 1: Send OTP (WhatsApp or Email)
  async function handleSendOtp() {
    if (method === "whatsapp" && (!phone.trim() || phone.replace(/\D/g, "").length < 9)) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (method === "email" && (!emailAddr.trim() || !emailAddr.includes("@"))) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (method === "whatsapp") {
        await api.post("/auth/send-otp", { phone });
      } else {
        await api.post("/auth/send-email-otp", { email: emailAddr });
      }
      startCountdown();
      setStep("otp");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Could not send verification code. Please check and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP
  async function handleVerifyOtp() {
    if (otp.length < 6) { setError("Enter the full 6-digit code."); return; }
    setLoading(true);
    setError("");
    try {
      if (method === "whatsapp") {
        await api.post("/auth/verify-otp", { phone, code: otp });
      } else {
        await api.post("/auth/verify-email-otp", { email: emailAddr, code: otp });
      }
      setStep("profile");
      // Pre-fill email if verified via email
      if (method === "email") setEmail(emailAddr);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Submit registration
  async function handleRegister() {
    if (!fullName.trim()) { setError("Your name is required."); return; }
    if (!company.trim()) { setError("Company name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/register", {
        fullName,
        company,
        email,
        phone,
        password,
      });
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP
  async function handleResend() {
    if (countdown > 0) return;
    setLoading(true);
    setError("");
    try {
      if (method === "whatsapp") {
        await api.post("/auth/send-otp", { phone });
      } else {
        await api.post("/auth/send-email-otp", { email: emailAddr });
      }
      startCountdown();
    } catch (e: any) {
      setError(e?.message || "Could not resend code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#07111f] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-xl shadow-sky-500/20 mb-4">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">FlowOps</h1>
          <p className="text-xs text-white/40 mt-1">Logistics, Evolved</p>
        </div>

        {/* ─── STEP 0: Choose Verification Method ─── */}
        {step === "method" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-black text-white">Verify your identity</h2>
              <p className="text-sm text-white/50 mt-1">Choose how you'd like to receive your verification code</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { setMethod("email"); setStep("phone"); }}
                className="w-full flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left hover:bg-emerald-500/10 transition"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
                  <Mail className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <div className="font-bold text-white">Email Verification</div>
                  <div className="text-xs text-white/50">Receive a 6-digit code via email</div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 ml-auto" />
              </button>

              <button
                onClick={() => { setMethod("whatsapp"); setStep("phone"); }}
                className="w-full flex items-center gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-left hover:bg-sky-500/10 transition"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20">
                  <MessageCircle className="h-6 w-6 text-sky-400" />
                </div>
                <div>
                  <div className="font-bold text-white">WhatsApp Verification</div>
                  <div className="text-xs text-white/50">Receive a 6-digit code via WhatsApp</div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 ml-auto" />
              </button>
            </div>

            <p className="text-center text-[11px] text-white/30">
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="text-sky-400 hover:text-sky-300 font-bold">Log in</button>
            </p>
          </div>
        )}

        {/* ─── STEP 1: Phone Number OR Email ─── */}
        {step === "phone" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-black text-white">
                {method === "whatsapp" ? "Verify your phone number" : "Verify your email"}
              </h2>
              <p className="text-sm text-white/50 mt-1">
                {method === "whatsapp"
                  ? "FlowOps will send a verification code via WhatsApp"
                  : "FlowOps will send a verification code to your email"}
              </p>
            </div>

            {method === "whatsapp" ? (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5 block">Phone number</label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-white/60">+27</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError(""); }}
                    placeholder="60 659 2875"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-sky-400/50 placeholder:text-white/25"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5 block">Email address</label>
                <input
                  type="email"
                  value={emailAddr}
                  onChange={(e) => { setEmailAddr(e.target.value); setError(""); }}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50 placeholder:text-white/25"
                />
              </div>
            )}

            {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-500/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? "Sending..." : "Send verification code"}
            </button>

            <button
              onClick={() => setStep("method")}
              className="w-full text-center text-xs text-white/40 hover:text-white/60"
            >
              ← Choose a different method
            </button>
          </div>
        )}
                  +27
                </span>
                <input
                  type="tel"
                  placeholder="81 234 5678"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(""); }}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Next
            </button>

            <p className="text-[11px] text-white/25 text-center leading-relaxed">
              By proceeding you agree to our{" "}
              <a href="/legal/terms" className="underline text-white/40">Terms</a> and{" "}
              <a href="/legal/privacy" className="underline text-white/40">Privacy Policy</a>
            </p>
          </div>
        )}

        {/* ─── STEP 2: OTP Verification ─── */}
        {step === "otp" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-black text-white">Enter verification code</h2>
              <p className="text-sm text-white/50 mt-1">
                We sent a 6-digit code to<br />
                <span className="font-bold text-white/70">+27 {phone}</span> via WhatsApp
              </p>
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="• • • • • •"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center text-2xl font-black tracking-[0.5em] text-white placeholder-white/20 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Verify
            </button>

            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-xs text-white/30">Resend code in {countdown}s</p>
              ) : (
                <button onClick={handleResend} disabled={loading} className="text-xs font-bold text-sky-400 hover:text-sky-300">
                  Didn't get the code? Resend
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 3: Profile Info ─── */}
        {step === "profile" && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300 mb-3">
                <CheckCircle2 className="h-3 w-3" /> Phone verified
              </div>
              <h2 className="text-lg font-black text-white">Set up your account</h2>
              <p className="text-sm text-white/50 mt-1">Almost there — just a few details</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 block">
                  <User className="inline h-3 w-3 mr-1" />Full name
                </label>
                <input
                  type="text"
                  placeholder="Meluxolo Jara"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 block">
                  <Building2 className="inline h-3 w-3 mr-1" />Company name
                </label>
                <input
                  type="text"
                  placeholder="Ukheshe Courier"
                  value={company}
                  onChange={(e) => { setCompany(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 block">
                  Email (for login)
                </label>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 block">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Create Account
            </button>
          </div>
        )}

        {/* ─── STEP 4: Success ─── */}
        {step === "done" && (
          <div className="space-y-6 text-center">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">You're in!</h2>
              <p className="text-sm text-white/50 mt-2 leading-relaxed">
                Your account request has been submitted.<br />
                We'll notify you once it's approved — usually within a few hours.
              </p>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-bold text-white/70 hover:bg-white/10 transition"
            >
              Go to Login
            </button>
          </div>
        )}

        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 pt-4">
            {(["phone", "otp", "profile"] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s === step ? "w-8 bg-emerald-400" : i < ["phone", "otp", "profile"].indexOf(step) ? "w-4 bg-emerald-400/40" : "w-4 bg-white/10"
                }`}
              />
            ))}
          </div>
        )}

        {/* Already have an account */}
        {step !== "done" && (
          <p className="text-center text-xs text-white/30">
            Already have an account?{" "}
            <a href="/login" className="font-bold text-sky-400 hover:text-sky-300">Log in</a>
          </p>
        )}
      </div>
    </div>
  );
}
