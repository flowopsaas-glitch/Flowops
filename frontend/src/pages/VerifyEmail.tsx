import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';
import { api } from '../api/client';

type Status = 'loading' | 'success' | 'error' | 'missing';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        const body = res as unknown as { data?: { message?: string }; message?: string };
        setMessage(body?.data?.message || body?.message || 'Email verified successfully.');
        setStatus('success');
      })
      .catch((err) => {
        setMessage(err?.message || 'Verification link is invalid or has expired.');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-10 text-center space-y-6 shadow-2xl">

        {status === 'loading' && (
          <>
            <Loader2 className="h-14 w-14 text-blue-400 animate-spin mx-auto" />
            <h1 className="text-2xl font-black">Verifying your email…</h1>
            <p className="text-slate-400">Just a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
            <h1 className="text-2xl font-black">Email verified!</h1>
            <p className="text-slate-300">{message}</p>
            <Link
              to="/login"
              className="inline-block mt-2 rounded-2xl bg-blue-500 px-8 py-3 font-bold text-white hover:bg-blue-400 transition"
            >
              Sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-14 w-14 text-rose-400 mx-auto" />
            <h1 className="text-2xl font-black">Verification failed</h1>
            <p className="text-slate-300">{message}</p>
            <p className="text-sm text-slate-400">
              Sign in and go to{' '}
              <strong className="text-white">Settings → Account</strong> to
              request a new verification link.
            </p>
            <Link
              to="/login"
              className="inline-block mt-2 rounded-2xl bg-white/10 px-8 py-3 font-bold text-white hover:bg-white/20 transition"
            >
              Back to sign in
            </Link>
          </>
        )}

        {status === 'missing' && (
          <>
            <Mail className="h-14 w-14 text-slate-400 mx-auto" />
            <h1 className="text-2xl font-black">No token provided</h1>
            <p className="text-slate-400">
              Use the link from the verification email. If you need a new one,
              sign in and request it from your account settings.
            </p>
            <Link
              to="/login"
              className="inline-block mt-2 rounded-2xl bg-white/10 px-8 py-3 font-bold text-white hover:bg-white/20 transition"
            >
              Back to sign in
            </Link>
          </>
        )}

      </div>
    </div>
  );
}
