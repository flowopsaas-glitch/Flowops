import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Building2, Mail, User, Phone, MessageSquare, CheckCircle, Loader2, ArrowRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const planDetails: Record<string, { name: string; price: string; color: string; features: string[] }> = {
  STARTER: {
    name: 'Starter',
    price: 'Free 14-day trial',
    color: '#4ADE80',
    features: ['Up to 5 users', 'Basic waybill management', 'Dashboard', 'Collections tracking'],
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 'R3,500/mo',
    color: '#6C9EFF',
    features: ['Up to 25 users', 'Advanced analytics', 'Email hub', 'Rate cards', 'Dispatch management'],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 'R7,500/mo',
    color: '#A78BFA',
    features: ['Unlimited users', 'AI-powered ops autopilot', 'WhatsApp integration', 'Priority support', 'Custom billing', 'SLA monitoring'],
  },
};

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const invitePlan = searchParams.get('plan') || '';
  const inviteEmail = searchParams.get('email') || '';
  const inviteToken = searchParams.get('invite') || '';

  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    contactEmail: inviteEmail,
    contactPhone: '',
    requestedPlan: (invitePlan || 'STARTER') as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
    message: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.contactEmail.trim() || !form.contactName.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/onboarding/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Signup request failed');
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = planDetails[form.requestedPlan] || planDetails.STARTER;

  // ── SUCCESS STATE ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e', padding: '24px' }}>
        <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.15)' }}>
            <CheckCircle size={32} color="#4ADE80" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>Request Submitted!</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '24px' }}>
            Your signup request for <strong style={{ color: 'white' }}>{form.companyName}</strong> on the <strong style={{ color: selectedPlan.color }}>{selectedPlan.name}</strong> plan has been received.
            <br /><br />
            Our team will review your request and you'll receive an email with your login credentials once approved.
          </p>
          <button onClick={() => navigate('/login')} style={{
            padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            color: 'white', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
          }}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ── SIGNUP FORM ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0a0f1e' }}>
      {/* Left: Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ maxWidth: '480px', width: '100%' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
              <span style={{ color: 'white', fontWeight: 900, fontSize: '14px' }}>F</span>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>FlowOps</span>
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
            {inviteToken ? 'Complete Your Signup' : 'Get Started with FlowOps'}
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>
            {inviteToken ? 'You\'ve been invited. Fill in your details below.' : 'Request access to the FlowOps logistics platform.'}
          </p>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Company Name */}
            <FormField icon={Building2} label="Company Name *" value={form.companyName}
              onChange={v => setForm({ ...form, companyName: v })} placeholder="e.g. Express Logistics" />

            {/* Contact Name */}
            <FormField icon={User} label="Your Name *" value={form.contactName}
              onChange={v => setForm({ ...form, contactName: v })} placeholder="e.g. John Smith" />

            {/* Email */}
            <FormField icon={Mail} label="Email Address *" value={form.contactEmail}
              onChange={v => setForm({ ...form, contactEmail: v })} placeholder="you@company.co.za" type="email" />

            {/* Phone */}
            <FormField icon={Phone} label="Phone (optional)" value={form.contactPhone}
              onChange={v => setForm({ ...form, contactPhone: v })} placeholder="+27 XX XXX XXXX" />

            {/* Plan Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '8px', color: 'rgba(255,255,255,0.5)' }}>
                Select Plan *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const).map(plan => {
                  const active = form.requestedPlan === plan;
                  const details = planDetails[plan];
                  return (
                    <button key={plan} type="button" onClick={() => setForm({ ...form, requestedPlan: plan })}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                        border: `2px solid ${active ? details.color : 'rgba(255,255,255,0.08)'}`,
                        background: active ? `${details.color}10` : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.2s',
                      }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: active ? details.color : 'rgba(255,255,255,0.5)' }}>
                        {details.name}
                      </div>
                      <div style={{ fontSize: '10px', marginTop: '4px', color: 'rgba(255,255,255,0.3)' }}>
                        {details.price}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                <MessageSquare size={12} style={{ display: 'inline', marginRight: '6px' }} />
                Message (optional)
              </label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="Tell us about your logistics needs..."
                rows={3}
                style={{
                  width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', resize: 'none',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none',
                }} />
            </div>

            {/* Submit */}
            <button type="submit" disabled={submitting} style={{
              width: '100%', padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
              color: 'white', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              background: submitting ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <>Submit Request <ArrowRight size={16} /></>}
            </button>

            {/* Login link */}
            <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: '#6C9EFF', textDecoration: 'none', fontWeight: 500 }}>Login here</a>
            </p>
          </form>
        </div>
      </div>

      {/* Right: Plan info panel */}
      <div style={{
        width: '380px', display: 'none', padding: '48px 32px',
        background: 'rgba(15,22,45,0.6)', borderLeft: '1px solid rgba(255,255,255,0.06)',
        flexDirection: 'column', justifyContent: 'center',
      }} className="lg:!flex">
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: selectedPlan.color, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            {selectedPlan.name} Plan
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>{selectedPlan.price}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>14-day free trial included</div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>WHAT YOU GET</div>
          {selectedPlan.features.map(feature => (
            <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <CheckCircle size={14} color={selectedPlan.color} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{feature}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>HOW IT WORKS</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.6' }}>
            1. Submit your signup request<br />
            2. Our AI reviews and triages your application<br />
            3. Admin approves → credentials auto-generated<br />
            4. You receive a welcome email with login details
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Form Field Component ────────────────────────────────────────────────────
function FormField({ icon: Icon, label, value, onChange, placeholder, type = 'text' }: {
  icon: any; label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
        <Icon size={12} /> {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '14px', color: 'white',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none',
        }} />
    </div>
  );
}
