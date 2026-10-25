import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/toast-context';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Invalid reset link. Request a new password reset from the login page.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      showToast('Password reset successfully.', 'success');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err?.message || 'Reset link is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-10 text-center space-y-4 shadow-2xl">
          <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
          <h1 className="text-2xl font-black">Password updated!</h1>
          <p className="text-slate-300">
            Redirecting you to sign in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl space-y-6">

        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
            <Lock className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black">Set new password</h1>
          <p className="text-slate-400 text-sm">Must be at least 8 characters.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400" htmlFor="field-new-password-2">
              New password
            </label>
            <input id="field-new-password-2"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400 disabled:opacity-50"
              placeholder="Min 8 characters"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400" htmlFor="field-confirm-password-1">
              Confirm password
            </label>
            <input id="field-confirm-password-1"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400 disabled:opacity-50"
              placeholder="Repeat password"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-blue-500 py-3.5 font-bold text-white hover:bg-blue-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Updating…' : 'Set new password'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          <Link to="/login" className="text-blue-300 hover:text-blue-200">
            Back to sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
