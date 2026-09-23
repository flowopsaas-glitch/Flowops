import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Check,
  Loader2,
  Mail,
  MessageCircle,
  Moon,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type EmailDigestFrequency,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
} from "../../api/notificationPreferencesApi";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";

const CHANNEL_META: Record<
  NotificationChannel,
  { label: string; hint: string; icon: typeof Mail }
> = {
  email: {
    label: "Email",
    hint: "Sent to the email on your FlowOps account.",
    icon: Mail,
  },
  sms: {
    label: "SMS",
    hint: "Text message to your registered phone. Per-message charges may apply.",
    icon: MessageCircle,
  },
  push: {
    label: "Push",
    hint: "Browser & installed-app notifications when FlowOps is open in a tab.",
    icon: Smartphone,
  },
};

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  operations: {
    label: "Operations",
    description:
      "Waybill creation, dispatch updates, delivery completions, POD submissions.",
  },
  billing: {
    label: "Billing",
    description:
      "Invoice generation, payment received, batch run results, credit alerts.",
  },
  security: {
    label: "Security",
    description:
      "Login from a new device, role or permission changes, suspicious activity.",
  },
  system: {
    label: "System",
    description:
      "Scheduled maintenance, downtime, version updates, integration health.",
  },
};

const DIGEST_OPTIONS: Array<{
  value: EmailDigestFrequency;
  label: string;
  hint: string;
}> = [
  {
    value: "off",
    label: "Instant",
    hint: "Each event sends an email when it happens.",
  },
  {
    value: "daily",
    label: "Daily digest",
    hint: "Bundle the day's events into one email at 07:00 in your timezone.",
  },
  {
    value: "weekly",
    label: "Weekly digest",
    hint: "Monday morning summary of the previous week.",
  },
];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function diff(
  current: NotificationPreferences,
  original: NotificationPreferences,
): Partial<NotificationPreferences> {
  const result: Partial<NotificationPreferences> = {};
  if (JSON.stringify(current.channels) !== JSON.stringify(original.channels)) {
    result.channels = current.channels;
  }
  if (
    JSON.stringify(current.categories) !== JSON.stringify(original.categories)
  ) {
    result.categories = current.categories;
  }
  if (current.emailDigest !== original.emailDigest) {
    result.emailDigest = current.emailDigest;
  }
  if (
    JSON.stringify(current.quietHours) !== JSON.stringify(original.quietHours)
  ) {
    result.quietHours = current.quietHours;
  }
  return result;
}

export default function NotificationPreferences() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [original, setOriginal] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyNotificationPreferences();
      setPrefs(data);
      setOriginal(data);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to load preferences";
      setError(message);
      // Keep the defaults so the form is usable even when the backend errors.
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // load() is stable in this component; intentional empty deps for once-on-mount.
     
  }, []);

  const isDirty = useMemo(
    () => Object.keys(diff(prefs, original)).length > 0,
    [prefs, original],
  );

  const setChannel = (channel: NotificationChannel, value: boolean) => {
    setPrefs((p) => ({
      ...p,
      channels: { ...p.channels, [channel]: value },
    }));
    setValidationError(null);
  };

  const setCategoryEnabled = (
    category: NotificationCategory,
    value: boolean,
  ) => {
    setPrefs((p) => ({
      ...p,
      categories: {
        ...p.categories,
        [category]: { ...p.categories[category], enabled: value },
      },
    }));
    setValidationError(null);
  };

  const setCategoryChannel = (
    category: NotificationCategory,
    channel: NotificationChannel,
    value: boolean,
  ) => {
    setPrefs((p) => ({
      ...p,
      categories: {
        ...p.categories,
        [category]: {
          ...p.categories[category],
          channels: { ...p.categories[category].channels, [channel]: value },
        },
      },
    }));
    setValidationError(null);
  };

  const setQuietHours = (
    next: Partial<NotificationPreferences["quietHours"]>,
  ) => {
    setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, ...next } }));
    setValidationError(null);
  };

  const setDigest = (value: EmailDigestFrequency) => {
    setPrefs((p) => ({ ...p, emailDigest: value }));
    setValidationError(null);
  };

  const validate = (): string | null => {
    if (prefs.quietHours.enabled) {
      if (!TIME_RE.test(prefs.quietHours.startsAt)) {
        return "Quiet-hours start must be in HH:MM 24-hour format.";
      }
      if (!TIME_RE.test(prefs.quietHours.endsAt)) {
        return "Quiet-hours end must be in HH:MM 24-hour format.";
      }
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    const payload = diff(prefs, original);
    if (Object.keys(payload).length === 0) {
      showToast("Nothing to save.", "info");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyNotificationPreferences(payload);
      setPrefs(updated);
      setOriginal(updated);
      showToast("Notification preferences saved.", "success");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save preferences.";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/40 hover:text-white"
          >
            <ArrowLeft size={14} />
            Back to Settings
          </Link>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white">
            <Bell size={28} className="text-blue-400" />
            Notification Preferences
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            Control which channels FlowOps may use to notify you, and which
            kinds of events trigger them.
            {user?.email ? (
              <>
                {" "}
                Email goes to{" "}
                <span className="font-mono text-white/70">{user.email}</span>.
              </>
            ) : null}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          Could not load preferences: {error}. The form below shows defaults
          and is editable, but saved values may not reflect the server until a
          refresh succeeds.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Channels */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <SectionHeader
            label="Delivery channels"
            description="Top-level switches. Disabling a channel here turns it off for every category."
          />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {NOTIFICATION_CHANNELS.map((channel) => {
              const meta = CHANNEL_META[channel];
              const Icon = meta.icon;
              return (
                <ChannelToggleCard
                  key={channel}
                  icon={<Icon size={18} />}
                  label={meta.label}
                  hint={meta.hint}
                  checked={prefs.channels[channel]}
                  onChange={(value) => setChannel(channel, value)}
                />
              );
            })}
          </div>
        </section>

        {/* Categories matrix */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <SectionHeader
            label="What you're notified about"
            description="Per-category opt-in. Categories disabled here send nothing on any channel. Channel cells respect the master switches above — a cell can only deliver if both the row and the channel are enabled."
          />

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">Category</th>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <th key={channel} className="px-4 py-3 text-center">
                      {CHANNEL_META[channel].label}
                      {!prefs.channels[channel] ? (
                        <span className="ml-2 normal-case tracking-normal text-amber-300/80">
                          (off)
                        </span>
                      ) : null}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {NOTIFICATION_CATEGORIES.map((category) => {
                  const cat = prefs.categories[category];
                  const meta = CATEGORY_META[category];
                  return (
                    <tr key={category} className={cat.enabled ? "" : "opacity-50"}>
                      <td className="px-4 py-4 align-top">
                        <div className="font-bold text-white">{meta.label}</div>
                        <div className="mt-1 text-[11px] text-white/50">
                          {meta.description}
                        </div>
                      </td>
                      {NOTIFICATION_CHANNELS.map((channel) => {
                        const channelOff = !prefs.channels[channel];
                        const disabled = !cat.enabled || channelOff;
                        return (
                          <td
                            key={channel}
                            className="px-4 py-4 text-center align-middle"
                          >
                            <Checkbox
                              checked={cat.channels[channel] && !disabled}
                              onChange={(value) =>
                                setCategoryChannel(category, channel, value)
                              }
                              disabled={disabled}
                              ariaLabel={`${meta.label} — ${CHANNEL_META[channel].label}`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-4 text-center align-middle">
                        <Switch
                          checked={cat.enabled}
                          onChange={(value) =>
                            setCategoryEnabled(category, value)
                          }
                          ariaLabel={`Enable ${meta.label} category`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Quiet hours */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <SectionHeader
            label="Quiet hours"
            description="Suppress non-urgent push and SMS deliveries during a daily window. Security alerts always break through."
            icon={<Moon size={14} />}
          />

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">
                  Enable quiet hours
                </div>
                <div className="text-[11px] text-white/50">
                  When on, only category-marked Security events will push or
                  SMS during the window.
                </div>
              </div>
              <Switch
                checked={prefs.quietHours.enabled}
                onChange={(value) => setQuietHours({ enabled: value })}
                ariaLabel="Enable quiet hours"
              />
            </div>

            <div
              className={`grid gap-4 md:grid-cols-3 ${
                prefs.quietHours.enabled ? "" : "opacity-50"
              }`}
            >
              <TimeField
                label="Starts at"
                value={prefs.quietHours.startsAt}
                onChange={(value) => setQuietHours({ startsAt: value })}
                disabled={!prefs.quietHours.enabled}
              />
              <TimeField
                label="Ends at"
                value={prefs.quietHours.endsAt}
                onChange={(value) => setQuietHours({ endsAt: value })}
                disabled={!prefs.quietHours.enabled}
              />
              <Field
                label="Timezone"
                hint="Detected automatically from your browser. Override if needed."
              >
                <input
                  type="text"
                  value={prefs.quietHours.timezone}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setQuietHours({ timezone: e.target.value })
                  }
                  disabled={!prefs.quietHours.enabled}
                  placeholder="Africa/Johannesburg"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60 disabled:cursor-not-allowed font-mono"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Email digest */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <SectionHeader
            label="Email digest"
            description="Bundle non-urgent emails into a single message. Security and billing-critical events still send instantly regardless of this setting."
          />

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {DIGEST_OPTIONS.map((opt) => {
              const selected = prefs.emailDigest === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setDigest(opt.value)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    selected
                      ? "border-blue-400/60 bg-blue-500/10"
                      : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white">
                      {opt.label}
                    </div>
                    {selected ? (
                      <div className="rounded-full bg-blue-500 p-1 text-white">
                        <Check size={12} />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 text-[11px] text-white/50">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </section>

        {validationError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {validationError}
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between rounded-2xl border border-white/10 bg-[#081120]/95 px-6 py-4 backdrop-blur md:mx-0">
          <div className="text-xs text-white/40">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </div>
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {saving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionHeader({
  label,
  description,
  icon,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
        {icon}
        {label}
      </div>
      {description ? (
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-white/55">
          {description}
        </p>
      ) : null}
    </header>
  );
}

function ChannelToggleCard({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-start justify-between gap-4 rounded-2xl border p-5 text-left transition ${
        checked
          ? "border-blue-400/50 bg-blue-500/10"
          : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/5"
      }`}
      aria-pressed={checked}
    >
      <div>
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-[11px] text-white/50">{hint}</div>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        ariaLabel={`${label} channel`}
      />
    </button>
  );
}

function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-blue-500" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      disabled={disabled}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? "border-blue-400 bg-blue-500 text-white"
          : "border-white/20 bg-black/30 text-transparent hover:border-white/40"
      }`}
    >
      <Check size={14} />
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
        {label}
      </div>
      {children}
      {hint ? <div className="text-[11px] text-white/40">{hint}</div> : null}
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="time"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60 disabled:cursor-not-allowed"
      />
    </Field>
  );
}
