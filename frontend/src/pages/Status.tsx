import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, XCircle, ArrowLeft } from 'lucide-react';

type CompanyInfo = {
  companyName: string;
  companyEmail: string;
  whatsapp: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export default function StatusPage() {
  const [company] = useState<CompanyInfo | null>(() => {
    // Read once, lazily, at first render — no effect round-trip needed for a
    // synchronous localStorage snapshot.
    try {
      const data = localStorage.getItem('companyInfo');
      return data ? (JSON.parse(data) as CompanyInfo) : null;
    } catch {
      return null;
    }
  });

  // (company state is initialised lazily from localStorage — see useState above.)

  if (!company) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-black text-white">No Application Found</h1>
          <p className="text-sm text-slate-400">You haven't submitted a company registration yet.</p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
          >
            Register Now
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      title: 'Pending Review',
      desc: "Your application is being reviewed. We'll notify you once it's approved.",
    },
    APPROVED: {
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      title: 'Approved',
      desc: 'Your company has been approved. You can now access all platform features.',
    },
    REJECTED: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      title: 'Not Approved',
      desc: 'Your application was not approved. Please contact support for assistance.',
    },
  };

  const cfg = statusConfig[company.status];
  const Icon = cfg.icon;

  const statusCardClass = cfg.bg + ' ' + cfg.border + ' border rounded-2xl p-8 text-center space-y-4';
  const iconClass = 'h-12 w-12 ' + cfg.color;

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className={statusCardClass}>
          <div className="flex justify-center">
            <Icon className={iconClass} />
          </div>
          <h1 className="text-2xl font-black text-white">{cfg.title}</h1>
          <p className="text-sm text-slate-400">{cfg.desc}</p>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Company</span>
            <span className="text-white font-medium">{company.companyName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Email</span>
            <span className="text-white font-medium">{company.companyEmail}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">WhatsApp</span>
            <span className="text-white font-medium">{company.whatsapp}</span>
          </div>
        </div>

        {company.status === 'APPROVED' && (
          <Link
            to="/login"
            className="block w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 text-white text-center hover:bg-blue-500 transition-colors"
          >
            Sign In to Dashboard
          </Link>
        )}

        <Link
          to="/legal/terms"
          className="flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          <ArrowLeft size={12} /> Back to Terms
        </Link>
      </div>
    </div>
  );
}
