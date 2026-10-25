import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-10 text-center space-y-4 shadow-2xl">
          <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
          <h1 className="text-2xl font-black">Check your email</h1>
          <p className="text-slate-300">
            If an account exists for <strong>{email}</strong>, we've sent a
            password reset link. It expires in 1 hour.
          </p>
          <Link
            to="/login"
            className="inline-block mt-2 text-sm text-blue-300 hover:text-blue-200"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl space-y-6">

        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
            <Mail className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black">Forgot password?</h1>
          <p className="text-slate-400 text-sm">
            Enter your email and we'll send a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400" htmlFor="field-email-address-1">
              Email address
            </label>
            <input id="field-email-address-1"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400 disabled:opacity-50"
              placeholder="you@company.com"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-blue-500 py-3.5 font-bold text-white hover:bg-blue-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Remembered it?{' '}
          <Link to="/login" className="text-blue-300 hover:text-blue-200">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
