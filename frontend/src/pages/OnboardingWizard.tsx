import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Palette,
  CreditCard,
  Users,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { api } from "../api/client";

// ─── Types ─────────────────────────────────────────────────────────────────
interface CompanyDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
}

interface Branding {
  logoUrl: string;
  brandName: string;
  primaryColor: string;
}

interface RateCard {
  id: string;
  name: string;
  fromZone: string;
  toZone: string;
  basePrice: number;
  perKgPrice: number;
  currency: string;
}

type TeamRole = "ADMIN" | "MANAGER" | "DISPATCH" | "AGENT" | "DRIVER";

interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
}

interface OnboardingState {
  currentStep: number;
  companyDetails: CompanyDetails;
  branding: Branding;
  rateCards: RateCard[];
  teamMembers: TeamMember[];
}

const STORAGE_KEY = "flowops_onboarding_state";

const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "NGN", "KES", "AED"];
const ROLES: TeamRole[] = ["ADMIN", "MANAGER", "DISPATCH", "AGENT", "DRIVER"];

const STEPS = [
  { label: "Company Details", icon: Building2 },
  { label: "Add First Driver", icon: Truck },
  { label: "Branding", icon: Palette },
  { label: "Rate Cards", icon: CreditCard },
  { label: "Invite Team", icon: Users },
];

const defaultState: OnboardingState = {
  currentStep: 0,
  companyDetails: { name: "", email: "", phone: "", address: "", vatNumber: "" },
  branding: { logoUrl: "", brandName: "", primaryColor: "#3b82f6" },
  rateCards: [],
  teamMembers: [],
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupted data
  }
  return defaultState;
}

function saveState(state: OnboardingState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Step Indicator ────────────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = idx === currentStep;
        const isCompleted = idx < currentStep;
        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isActive
                    ? "border-blue-500 bg-blue-500/20 text-blue-400"
                    : isCompleted
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-white/20 bg-white/5 text-white/30"
                }`}
              >
                {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
              </div>
              <span
                className={`text-[11px] mt-2 whitespace-nowrap font-medium ${
                  isActive
                    ? "text-blue-400"
                    : isCompleted
                    ? "text-emerald-400"
                    : "text-white/30"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-16 h-[2px] mx-2 mt-[-18px] transition-all duration-300 ${
                  idx < currentStep ? "bg-emerald-500" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Company Details ───────────────────────────────────────────────
function StepCompanyDetails({
  data,
  onChange,
}: {
  data: CompanyDetails;
  onChange: (d: CompanyDetails) => void;
}) {
  const update = (field: keyof CompanyDetails, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <Building2 size={22} className="text-blue-400" />
        Company Details
      </h2>
      <p className="text-sm text-white/50">Tell us about your company so we can set up your account.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Company Name" value={data.name} onChange={(v) => update("name", v)} placeholder="e.g. FastShip Logistics" />
        <Input label="Email" type="email" value={data.email} onChange={(v) => update("email", v)} placeholder="admin@company.co.za" />
        <Input label="Phone" value={data.phone} onChange={(v) => update("phone", v)} placeholder="+27 11 123 4567" />
        <Input label="VAT Number" value={data.vatNumber} onChange={(v) => update("vatNumber", v)} placeholder="4123456789" />
      </div>
      <Input label="Address" value={data.address} onChange={(v) => update("address", v)} placeholder="123 Logistics Road, Johannesburg" fullWidth />
    </div>
  );
}

// ─── Step 2: Branding ──────────────────────────────────────────────────────
function StepBranding({
  data,
  onChange,
}: {
  data: Branding;
  onChange: (d: Branding) => void;
}) {
  const update = (field: keyof Branding, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <Palette size={22} className="text-purple-400" />
        Branding
      </h2>
      <p className="text-sm text-white/50">Customize how your company appears to clients and drivers.</p>
      <div className="space-y-4">
        <Input label="Brand Name" value={data.brandName} onChange={(v) => update("brandName", v)} placeholder="Your brand display name" fullWidth />
        <Input label="Logo URL" value={data.logoUrl} onChange={(v) => update("logoUrl", v)} placeholder="https://cdn.example.com/logo.png" fullWidth />
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1.5" htmlFor="field-primary-color-3">Primary Color</label>
          <div className="flex items-center gap-3">
            <input id="field-primary-color-3"
              type="color"
              value={data.primaryColor}
              onChange={(e) => update("primaryColor", e.target.value)}
              className="w-12 h-10 rounded-xl border border-white/10 bg-transparent cursor-pointer"
            />
            <span className="text-sm text-white/70 font-mono">{data.primaryColor}</span>
            {data.primaryColor && (
              <div
                className="w-24 h-10 rounded-xl border border-white/10"
                style={{ backgroundColor: data.primaryColor }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Rate Cards ────────────────────────────────────────────────────
function StepRateCards({
  data,
  onChange,
}: {
  data: RateCard[];
  onChange: (d: RateCard[]) => void;
}) {
  const addCard = () => {
    onChange([
      ...data,
      { id: generateId(), name: "", fromZone: "", toZone: "", basePrice: 0, perKgPrice: 0, currency: "ZAR" },
    ]);
  };

  const removeCard = (id: string) => onChange(data.filter((c) => c.id !== id));

  const updateCard = (id: string, field: keyof RateCard, value: string | number) => {
    onChange(data.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <CreditCard size={22} className="text-amber-400" />
        Rate Cards
      </h2>
      <p className="text-sm text-white/50">Add at least one rate card to define your pricing zones.</p>

      {data.map((card) => (
        <div key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Input label="Name" value={card.name} onChange={(v) => updateCard(card.id, "name", v)} placeholder="Standard Rate" />
            <button
              onClick={() => removeCard(card.id)}
              className="ml-3 mt-4 p-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="From Zone" value={card.fromZone} onChange={(v) => updateCard(card.id, "fromZone", v)} placeholder="JHB" />
            <Input label="To Zone" value={card.toZone} onChange={(v) => updateCard(card.id, "toZone", v)} placeholder="CPT" />
            <Input label="Base Price" type="number" value={String(card.basePrice)} onChange={(v) => updateCard(card.id, "basePrice", parseFloat(v) || 0)} placeholder="0" />
            <Input label="Per-Kg Price" type="number" value={String(card.perKgPrice)} onChange={(v) => updateCard(card.id, "perKgPrice", parseFloat(v) || 0)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5" htmlFor="field-currency-2">Currency</label>
            <select id="field-currency-2"
              value={card.currency}
              onChange={(e) => updateCard(card.id, "currency", e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-[#0a1628]">{c}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <button
        onClick={addCard}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-white/20 px-5 py-3 text-sm font-semibold text-white/60 hover:border-blue-500/40 hover:text-blue-400 transition w-full justify-center"
      >
        <Plus size={16} /> Add Rate Card
      </button>
    </div>
  );
}

// ─── Step 4: Invite Team ───────────────────────────────────────────────────
function StepInviteTeam({
  data,
  onChange,
}: {
  data: TeamMember[];
  onChange: (d: TeamMember[]) => void;
}) {
  const addMember = () => {
    onChange([...data, { id: generateId(), email: "", role: "AGENT" }]);
  };

  const removeMember = (id: string) => onChange(data.filter((m) => m.id !== id));

  const updateMember = (id: string, field: keyof TeamMember, value: string) => {
    onChange(data.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <Users size={22} className="text-teal-400" />
        Invite Team
      </h2>
      <p className="text-sm text-white/50">Add team members who will use FlowOps. Invitations are sent on completion.</p>

      {data.map((member) => (
        <div key={member.id} className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="Email" type="email" value={member.email} onChange={(v) => updateMember(member.id, "email", v)} placeholder="team@company.co.za" fullWidth />
          </div>
          <div className="w-40">
            <label className="block text-xs font-semibold text-white/60 mb-1.5" htmlFor="field-role-1">Role</label>
            <select id="field-role-1"
              value={member.role}
              onChange={(e) => updateMember(member.id, "role", e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-[#0a1628]">{r}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => removeMember(member.id)}
            className="mb-0.5 p-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <button
        onClick={addMember}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-white/20 px-5 py-3 text-sm font-semibold text-white/60 hover:border-blue-500/40 hover:text-blue-400 transition w-full justify-center"
      >
        <Plus size={16} /> Add Team Member
      </button>
    </div>
  );
}

// ─── Reusable Input ────────────────────────────────────────────────────────
function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "w-full" : ""}>
      <label className="block text-xs font-semibold text-white/60 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50 transition"
      />
    </div>
  );
}

// ─── Confetti CSS Animation ────────────────────────────────────────────────
// Pure seeded scatter for the confetti burst: stable per-piece values in
// [0, 1) without calling Math.random() during render.
function seededScatter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function ConfettiEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm animate-confetti"
          style={{
            left: `${seededScatter(i * 3) * 100}%`,
            backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"][i % 6],
            animationDelay: `${seededScatter(i * 3 + 1) * 2}s`,
            animationDuration: `${2 + seededScatter(i * 3 + 2) * 2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall 3s ease-in forwards;
        }
      `}</style>
    </div>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────
function SuccessScreen() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8">
      <ConfettiEffect />
      <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 animate-pulse">
        <Sparkles size={36} className="text-emerald-400" />
      </div>
      <h1 className="text-3xl font-black text-white mb-3">You&apos;re All Set!</h1>
      <p className="text-white/50 max-w-md mb-8">
        Your company is ready to go. Your team invitations will be sent out shortly.
        Welcome to FlowOps!
      </p>
      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white hover:bg-blue-500 transition"
      >
        Go to Dashboard <ArrowRight size={16} />
      </a>
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────
export default function OnboardingWizard() {
  const [state, setState] = useState<OnboardingState>(loadState);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { currentStep, companyDetails, branding, rateCards, teamMembers } = state;

  // Persist to localStorage on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateState = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  const goNext = async () => {
    setError(null);
    setLoading(true);
    try {
      if (currentStep === 0) {
        // Step 1: Save company details
        await api.patch("/companies/my-company", companyDetails);
      } else if (currentStep === 1) {
        // Step 2: Save branding
        await api.patch("/companies/my-company", {
          logoUrl: branding.logoUrl,
          brandName: branding.brandName,
          primaryColor: branding.primaryColor,
        });
      } else if (currentStep === 2) {
        // Step 3: Create rate cards
        for (const card of rateCards) {
          await api.post("/rate-cards", {
            name: card.name,
            fromZone: card.fromZone,
            toZone: card.toZone,
            basePrice: card.basePrice,
            perKgPrice: card.perKgPrice,
            currency: card.currency,
          });
        }
      }
      updateState({ currentStep: currentStep + 1 });
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    updateState({ currentStep: currentStep - 1 });
  };

  const completeSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      // Store team members locally — actual invite happens on complete
      await api.post("/companies/onboarding-complete", {
        teamMembers: teamMembers.map((m) => ({ email: m.email, role: m.role })),
      });
      localStorage.removeItem(STORAGE_KEY);
      setCompleted(true);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canProceed = (): boolean => {
    if (currentStep === 0) {
      return !!(companyDetails.name && companyDetails.email);
    }
    if (currentStep === 1) {
      return !!(branding.brandName);
    }
    if (currentStep === 2) {
      return rateCards.length > 0 && rateCards.every((c) => c.name && c.fromZone && c.toZone);
    }
    if (currentStep === 3) {
      return true; // team invites are optional
    }
    return true;
  };

  if (completed) {
    return (
      <div className="min-h-full bg-[#07111f] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <SuccessScreen />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#07111f] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8">
        <StepIndicator currentStep={currentStep} />

        {/* Step content */}
        <div className="min-h-[320px]">
          {currentStep === 0 && (
            <StepCompanyDetails data={companyDetails} onChange={(d) => updateState({ companyDetails: d })} />
          )}
          {currentStep === 1 && (
            <StepBranding data={branding} onChange={(d) => updateState({ branding: d })} />
          )}
          {currentStep === 2 && (
            <StepRateCards data={rateCards} onChange={(d) => updateState({ rateCards: d })} />
          )}
          {currentStep === 3 && (
            <StepInviteTeam data={teamMembers} onChange={(d) => updateState({ teamMembers: d })} />
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
          <button
            onClick={goBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/60 hover:text-white hover:border-white/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={16} /> Back
          </button>

          {currentStep < 3 ? (
            <button
              onClick={goNext}
              disabled={!canProceed() || loading}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={completeSetup}
              disabled={loading}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white hover:bg-emerald-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
