import { errorMessageOf } from "@/components/patterns/errorMessage";
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../components/toast-context';
import {
  Building2, Palette, Bell, Users, CreditCard, Plug, Shield,
  ChevronRight, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  Globe, Phone, Mail, MapPin, Gauge, Save, Pencil, X, DollarSign
} from 'lucide-react';
import { SUPPORTED_CURRENCIES, SUPPORTED_COUNTRIES } from '../lib/currency';

type Company = {
  id: string;
  name: string;
  tradingName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  plan?: string | null;
  isActive?: boolean;
  primaryColor?: string | null;
  brandName?: string | null;
  slaBreachMinutes?: number | null;
  slaWarningMinutes?: number | null;
  currency?: string | null;
  whatsappNumber?: string | null;
  vatNumber?: string | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankBranchCode?: string | null;
  bankAccountType?: string | null;
};

function unwrap<T>(raw: unknown): T { return ((raw as { data?: T } | null)?.data ?? raw) as T; }

const PLAN_BADGE: Record<string, string> = {
  starter:      'bg-slate-500/20 text-slate-300 border-slate-500/30',
  professional: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  enterprise:   'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

type SettingTile = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
};

const TILES: SettingTile[] = [
  { title: 'Branding',        desc: 'Colours, logo, white-label portal',   icon: Palette,   href: '/settings/branding' },
  { title: 'Users & Roles',   desc: 'Manage team members and permissions', icon: Users,     href: '/user-roles' },
  { title: 'Notifications',   desc: 'Alert preferences and channels',      icon: Bell,      href: '/notifications' },
  { title: 'Integrations',    desc: 'API keys, webhooks, third-party',     icon: Plug,      href: '/settings/integrations' },
  { title: 'Billing & Plans', desc: 'Subscription, plans and invoice history', icon: CreditCard, href: '/billing/plans' },
  { title: 'Rate Cards',      desc: 'Pricing rules per zone and weight',   icon: Gauge,     href: '/rate-cards' },
];

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [company, setCompany]     = useState<Company | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(false);
  const [saving,  setSaving]      = useState(false);
  const [draft,   setDraft]       = useState<Partial<Company>>({});

  const loadCompany = useCallback(() => (async () => {
    const raw = await api.get('/companies/my-company');
    const data = unwrap<Company>(raw);
    setCompany(data);
    setDraft(data ?? {});

  })().catch((err: unknown) => {
    showToast(errorMessageOf(err) || 'Failed to load company settings', 'error');

  }).finally(() => {
    setLoading(false);

  }), [showToast]);

  useEffect(() => { void loadCompany(); }, [loadCompany]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<Company> = {
        name:             draft.name,
        tradingName:      draft.tradingName,
        email:            draft.email,
        phone:            draft.phone,
        address:          draft.address,
        city:             draft.city,
        country:          draft.country,
        currency:         draft.currency,
        vatNumber:        draft.vatNumber,
        whatsappNumber:   draft.whatsappNumber,
        bankName:         draft.bankName,
        bankAccountHolder: draft.bankAccountHolder,
        bankAccountNumber: draft.bankAccountNumber,
        bankBranchCode:   draft.bankBranchCode,
        bankAccountType:  draft.bankAccountType,
        brandName:        draft.brandName,
      };
      const raw = await api.patch('/companies/my-company', payload);
      const updated = unwrap<Company>(raw);
      setCompany(updated ?? { ...company, ...payload });
      setEditing(false);
      showToast('Settings saved successfully', 'success');
    } catch (err) {
      showToast(errorMessageOf(err) || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraft(company ?? {});
    setEditing(false);
  }

  const planKey = String(company?.plan || 'starter').toLowerCase();
  const planBadgeClass = PLAN_BADGE[planKey] || PLAN_BADGE.starter;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-6">

        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Building2 className="h-3.5 w-3.5" />
                Account Settings
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Settings</h1>
              <p className="mt-1 text-sm text-white/55">
                Manage your company profile, integrations, and account preferences.
              </p>
            </div>
            <button
              onClick={() => void loadCompany()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Company Profile Card ── */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25">
                <Building2 className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Company Profile</h2>
                <p className="text-xs text-white/45">Core identity and contact details</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {company?.plan && (
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${planBadgeClass}`}>
                  {company.plan}
                </span>
              )}
              {company?.isActive !== undefined && (
                <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  company.isActive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}>
                  {company.isActive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {company.isActive ? 'Active' : 'Inactive'}
                </span>
              )}
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white transition"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-bold text-sky-300 hover:bg-sky-500/25 transition disabled:opacity-40"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse h-14 rounded-2xl border border-white/5 bg-white/5" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField
                icon={Building2} label="Company Name"
                value={draft.name} editing={editing}
                onChange={v => setDraft(d => ({ ...d, name: v }))}
              />
              <ProfileField
                icon={Building2} label="Trading Name"
                value={draft.tradingName} editing={editing}
                onChange={v => setDraft(d => ({ ...d, tradingName: v }))}
              />
              <ProfileField
                icon={Mail} label="Email"
                value={draft.email} editing={editing}
                onChange={v => setDraft(d => ({ ...d, email: v }))}
              />
              <ProfileField
                icon={Phone} label="Phone"
                value={draft.phone} editing={editing}
                onChange={v => setDraft(d => ({ ...d, phone: v }))}
              />
              <ProfileField
                icon={MapPin} label="Address"
                value={draft.address} editing={editing}
                onChange={v => setDraft(d => ({ ...d, address: v }))}
              />
              <ProfileField
                icon={Globe} label="City"
                value={draft.city} editing={editing}
                onChange={v => setDraft(d => ({ ...d, city: v }))}
              />
              {editing ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/50">
                    <Globe className="h-3.5 w-3.5" /> Country
                  </div>
                  <select
                    value={draft.country || 'ZA'}
                    onChange={e => setDraft(d => ({ ...d, country: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
                  >
                    {SUPPORTED_COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <ProfileField
                  icon={Globe} label="Country"
                  value={SUPPORTED_COUNTRIES.find(c => c.code === draft.country)?.name || draft.country || 'South Africa'}
                  editing={false} onChange={() => {}}
                />
              )}
              {editing ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/50">
                    <DollarSign className="h-3.5 w-3.5" /> Currency
                  </div>
                  <select
                    value={draft.currency || 'ZAR'}
                    onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
                  >
                    {SUPPORTED_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.symbol} — {c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <ProfileField
                  icon={DollarSign} label="Currency"
                  value={`${SUPPORTED_CURRENCIES.find(c => c.code === draft.currency)?.symbol || 'R'} — ${SUPPORTED_CURRENCIES.find(c => c.code === draft.currency)?.name || 'South African Rand'} (${draft.currency || 'ZAR'})`}
                  editing={false} onChange={() => {}}
                />
              )}
              <ProfileField
                icon={Shield} label="VAT Number"
                value={draft.vatNumber} editing={editing}
                onChange={v => setDraft(d => ({ ...d, vatNumber: v }))}
              />
              <ProfileField
                icon={Phone} label="WhatsApp Number"
                value={draft.whatsappNumber} editing={editing}
                onChange={v => setDraft(d => ({ ...d, whatsappNumber: v }))}
              />
              <div className="sm:col-span-2 mt-2 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/70 mb-4">Banking Details (appears on invoices)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfileField icon={Building2} label="Bank Name" value={draft.bankName} editing={editing} onChange={v => setDraft(d => ({ ...d, bankName: v }))} />
                  <ProfileField icon={Building2} label="Account Holder" value={draft.bankAccountHolder} editing={editing} onChange={v => setDraft(d => ({ ...d, bankAccountHolder: v }))} />
                  <ProfileField icon={Building2} label="Account Number" value={draft.bankAccountNumber} editing={editing} onChange={v => setDraft(d => ({ ...d, bankAccountNumber: v }))} />
                  <ProfileField icon={Building2} label="Branch Code" value={draft.bankBranchCode} editing={editing} onChange={v => setDraft(d => ({ ...d, bankBranchCode: v }))} />
                  <ProfileField icon={Building2} label="Account Type" value={draft.bankAccountType} editing={editing} onChange={v => setDraft(d => ({ ...d, bankAccountType: v }))} />
                </div>
              </div>
            </div>
          )}

          {/* SLA row */}
          {!loading && company && (company.slaBreachMinutes || company.slaWarningMinutes) && (
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
              <Clock className="h-4 w-4 flex-shrink-0 text-amber-400" />
              <div className="text-sm text-amber-200/80">
                <span className="font-bold">SLA: </span>
                {company.slaWarningMinutes && (
                  <span>Warning at {company.slaWarningMinutes} min · </span>
                )}
                {company.slaBreachMinutes && (
                  <span>Breach at {company.slaBreachMinutes} min</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Quick-Navigate Settings Tiles ── */}
        <div>
          <h2 className="mb-3 px-1 text-xs font-black uppercase tracking-[0.18em] text-white/40">
            Settings Areas
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TILES.map(tile => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.href}
                  onClick={() => navigate(tile.href)}
                  className="group flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/10 hover:border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
                >
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/8 ring-1 ring-white/10 group-hover:ring-sky-500/30 transition">
                    <Icon className="h-5 w-5 text-white/70 group-hover:text-sky-400 transition" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm">{tile.title}</p>
                    <p className="mt-0.5 text-xs text-white/45 leading-relaxed truncate">{tile.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition" />
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Reusable profile field ────────────────────────────────────────────────────
function ProfileField({
  icon: Icon, label, value, editing, onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-white/40" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</span>
      </div>
      {editing ? (
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-sky-400/30"
        />
      ) : (
        <p className="text-sm font-semibold text-white/85 truncate">
          {value || <span className="text-white/25 font-normal italic">Not set</span>}
        </p>
      )}
    </div>
  );
}
