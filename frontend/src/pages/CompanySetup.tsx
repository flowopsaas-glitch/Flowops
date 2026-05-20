import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui/use-toast';
import { Building2, Mail, Phone, ArrowRight } from 'lucide-react';

export default function CompanySetup() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  function submit() {
    if (!companyName || !companyEmail || !whatsapp) {
      toast({ title: 'Missing fields', description: 'Please complete all fields', variant: 'destructive' });
      return;
    }

    localStorage.setItem(
      'companyInfo',
      JSON.stringify({ companyName, companyEmail, whatsapp, status: 'PENDING' })
    );

    toast({ title: 'Submitted', description: 'Company setup submitted for approval.' });
    navigate('/status');
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-4">
            <Building2 size={12} /> New Tenant Setup
          </div>
          <h1 className="text-2xl font-black text-white">Register Your Company</h1>
          <p className="text-sm text-slate-400 mt-2">Submit your details for platform access approval.</p>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Company Name</label>
            <div className="relative flex items-center">
              <Building2 className="absolute left-3 text-slate-500" size={16} />
              <input
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                placeholder="Acme Logistics"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business Email</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3 text-slate-500" size={16} />
              <input
                type="email"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                placeholder="admin@acme.co.za"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp Number</label>
            <div className="relative flex items-center">
              <Phone className="absolute left-3 text-slate-500" size={16} />
              <input
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                placeholder="+27 82 123 4567"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={submit}
            className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
          >
            Submit for Approval <ArrowRight size={14} />
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-500">
          By submitting, you agree to our{' '}
          <a href="/legal/terms" className="text-blue-400 hover:text-blue-300 underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/legal/privacy" className="text-blue-400 hover:text-blue-300 underline">Privacy Notice</a>.
        </p>
      </div>
    </div>
  );
}
