import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, AlertCircle } from 'lucide-react';

interface AISecurityGateProps {
  onVerified: (sessionId: number) => void;
  companyName: string;
}

export default function AISecurityGate({ onVerified, companyName }: AISecurityGateProps) {
  const [code, setCode] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!code.trim() || !clientEmail.trim()) {
      setError('Please enter both security code and email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';

      const response = await fetch(`${API_BASE}/ai-security/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code, clientEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid security code');
      }

      onVerified(data.sessionId);
    } catch (err: any) {
      setError(err.message || 'Failed to verify security code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Secure AI Access</h1>
          <p className="text-slate-400 text-sm">
            Enter your security code to access {companyName}'s AI assistant
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2">
              Client Email
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2">
              Security Code
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ENTER-CODE-HERE"
                className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono tracking-wider"
                maxLength={20}
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition shadow-lg shadow-blue-500/25"
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-white/5">
          <p className="text-xs text-slate-500 text-center">
            💬 Each message costs R0.50 and will be billed to your account
          </p>
        </div>
      </motion.div>
    </div>
  );
}
