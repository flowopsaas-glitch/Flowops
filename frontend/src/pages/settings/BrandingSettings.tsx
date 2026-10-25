import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Image as ImageIcon, Loader2, Palette, RefreshCw, Upload, Trash2 } from "lucide-react";
import {
  updateMyCompanyBranding,
  type UpdateMyCompanyBrandingPayload,
} from "../../api/companiesApi";
import { useToast } from "../../components/toast-context";
import { useTenant } from "../../contexts/tenant-context";

type FormState = {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  invoiceHeaderColor: string;
  portalSubdomain: string;
};

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Max size for a manually-uploaded (inline data-URL) logo. Larger logos should
// be hosted and referenced by URL to keep the company row lean.
const MAX_LOGO_BYTES = 512 * 1024;

function buildInitialForm(
  tenant: ReturnType<typeof useTenant>["tenant"],
): FormState {
  return {
    brandName: tenant?.brandName ?? "",
    logoUrl: tenant?.logoUrl ?? "",
    primaryColor: tenant?.primaryColor ?? "",
    secondaryColor: tenant?.secondaryColor ?? "",
    invoiceHeaderColor: tenant?.invoiceHeaderColor ?? "",
    portalSubdomain: tenant?.portalSubdomain ?? "",
  };
}

function normaliseColour(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Allow `3b82f6` shorthand without `#`.
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

function diff(form: FormState, tenant: ReturnType<typeof useTenant>["tenant"]) {
  const original = buildInitialForm(tenant);
  const changed: UpdateMyCompanyBrandingPayload = {};
  (Object.keys(form) as Array<keyof FormState>).forEach((key) => {
    if (form[key] !== original[key]) {
      // Send empty strings as null so the backend can clear the column.
      const value = form[key].trim();
      changed[key as keyof UpdateMyCompanyBrandingPayload] =
        value === "" ? null : value;
    }
  });
  return changed;
}

export default function BrandingSettings() {
  const { tenant, branding, isLoading, error, refresh } = useTenant();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(tenant));
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset the form when the tenant record loads / changes — adjusted
  // during render when a different record arrives, not in an effect.
  const [formTenant, setFormTenant] = useState(tenant);
  if (tenant !== formTenant) {
    setFormTenant(tenant);
    setForm(buildInitialForm(tenant));
  }

  const isDirty = useMemo(() => Object.keys(diff(form, tenant)).length > 0, [form, tenant]);

  const handleChange =
    (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setValidationError(null);
    };

  const handleColourChange =
    (field: "primaryColor" | "secondaryColor" | "invoiceHeaderColor") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: normaliseColour(event.target.value) }));
      setValidationError(null);
    };

  // Manual logo upload: embed the chosen image as a data URL straight into the
  // logoUrl field, so a tenant admin can set a logo without hosting it anywhere.
  // Saved through the same branding form (PATCH /companies/my-company).
  const handleLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setValidationError("Logo must be an image file (PNG, SVG, JPG, WebP).");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setValidationError("Logo must be 512KB or smaller — for a larger image, host it and paste the URL above.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logoUrl: String(reader.result || "") }));
      setValidationError(null);
    };
    reader.onerror = () => setValidationError("Could not read that image. Please try another file.");
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setForm((prev) => ({ ...prev, logoUrl: "" }));
    setValidationError(null);
  };

  const validate = (): string | null => {
    const colours: Array<[string, string]> = [
      ["primary", form.primaryColor],
      ["secondary", form.secondaryColor],
      ["invoice header", form.invoiceHeaderColor],
    ];
    for (const [label, value] of colours) {
      if (value && !HEX_COLOR_RE.test(value)) {
        return `${label} colour must be a hex string like #3b82f6`;
      }
    }
    if (form.logoUrl && !/^(\/|https?:\/\/|data:image\/)/i.test(form.logoUrl.trim())) {
      return "Logo must be an absolute URL (https://...), a path starting with `/`, or an uploaded image";
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
    const payload = diff(form, tenant);
    if (Object.keys(payload).length === 0) {
      showToast("Nothing to save.", "info");
      return;
    }
    setSaving(true);
    try {
      await updateMyCompanyBranding(payload);
      showToast("Branding saved.", "success");
      await refresh();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save branding.";
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
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Branding &amp; Identity
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            How your tenant appears across the FlowOps app and the customer-facing
            booking portal. Changes apply immediately on save.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          Could not load tenant: {error}. The form below is editable but values
          may not reflect the current backend state until refresh succeeds.
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)]">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8"
        >
          <section className="space-y-4">
            <header className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
              <Palette size={14} className="text-white/70" />
              Identity
            </header>

            <Field
              label="Brand name"
              hint="Shown in the sidebar and email headers. Defaults to your tenant name."
            >
              <input
                type="text"
                value={form.brandName}
                onChange={handleChange("brandName")}
                placeholder={tenant?.name ?? "Your tenant name"}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60"
              />
            </Field>

            <Field
              label="Portal subdomain"
              hint="Used by the public booking portal at {subdomain}.flowops.example. Lowercase letters, digits, dashes."
            >
              <input
                type="text"
                value={form.portalSubdomain}
                onChange={handleChange("portalSubdomain")}
                placeholder="acme-logistics"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60 font-mono"
              />
            </Field>

            <Field
              label="Logo URL"
              hint="Absolute URL (https://...) or a backend path like /uploads/logo.png. PNG/SVG recommended."
            >
              <input
                type="text"
                value={form.logoUrl}
                onChange={handleChange("logoUrl")}
                placeholder="https://cdn.example.com/logo.png"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60"
              />
            </Field>

            {/* Manual upload — for admins without a hosted image */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">or upload manually</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt="Logo preview"
                      className="h-full w-full object-contain"
                      onError={(e) => { (e.currentTarget.style.display = "none"); }}
                    />
                  ) : (
                    <ImageIcon size={22} className="text-white/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-400">
                      <Upload size={14} />
                      Choose image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoFile}
                        className="hidden"
                      />
                    </label>
                    {form.logoUrl ? (
                      <button
                        type="button"
                        onClick={clearLogo}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] text-white/40">
                    PNG, SVG, JPG or WebP up to 512KB. The image is embedded directly and applied when you save.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/5 pt-6">
            <header className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
              <Palette size={14} className="text-white/70" />
              Colours
            </header>

            <ColourField
              label="Primary"
              hint="Used for action buttons, accents, and the booking-portal hero."
              value={form.primaryColor}
              onChange={handleColourChange("primaryColor")}
              placeholderColor={branding.primaryColor}
            />
            <ColourField
              label="Secondary"
              hint="Used for highlights and pill backgrounds."
              value={form.secondaryColor}
              onChange={handleColourChange("secondaryColor")}
              placeholderColor={branding.secondaryColor}
            />
            <ColourField
              label="Invoice header"
              hint="Override the header strip on generated invoices. Defaults to the primary colour."
              value={form.invoiceHeaderColor}
              onChange={handleColourChange("invoiceHeaderColor")}
              placeholderColor={branding.invoiceHeaderColor}
            />
          </section>

          {validationError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {validationError}
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-white/5 pt-6">
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
              {saving ? "Saving..." : "Save branding"}
            </button>
          </div>
        </form>

        <BrandingPreview branding={branding} />
      </div>
    </div>
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

function ColourField({
  label,
  hint,
  value,
  onChange,
  placeholderColor,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholderColor: string;
}) {
  const safeColour = HEX_COLOR_RE.test(value) ? value : placeholderColor;
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
        {label}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={safeColour}
          onChange={onChange}
          className="h-12 w-14 cursor-pointer rounded-xl border border-white/10 bg-black/40 p-1"
          aria-label={`${label} colour swatch`}
        />
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholderColor}
          className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60 font-mono uppercase"
        />
      </div>
      {hint ? <div className="text-[11px] text-white/40">{hint}</div> : null}
    </div>
  );
}

function BrandingPreview({
  branding,
}: {
  branding: ReturnType<typeof useTenant>["branding"];
}) {
  return (
    <aside className="sticky top-6 h-fit space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
        Live preview
      </div>

      <div
        className="rounded-2xl p-5"
        style={{
          background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`,
        }}
      >
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.brandName} logo`}
              className="h-12 w-12 rounded-xl border border-white/30 bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-white/70">
              <ImageIcon size={18} />
            </div>
          )}
          <div className="text-base font-black tracking-tight text-white truncate">
            {branding.brandName}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SwatchRow label="Primary" colour={branding.primaryColor} />
        <SwatchRow label="Secondary" colour={branding.secondaryColor} />
        <SwatchRow label="Invoice header" colour={branding.invoiceHeaderColor} />
      </div>

      <div className="rounded-xl bg-black/40 px-3 py-2 text-[11px] text-white/40">
        Colours are also exposed as CSS variables —{" "}
        <code className="font-mono text-white/60">var(--brand-primary)</code>,{" "}
        <code className="font-mono text-white/60">var(--brand-secondary)</code>,{" "}
        <code className="font-mono text-white/60">var(--brand-invoice-header)</code>.
      </div>
    </aside>
  );
}

function SwatchRow({ label, colour }: { label: string; colour: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-white/70">
      <span className="text-white/50">{label}</span>
      <span className="flex items-center gap-2 font-mono uppercase">
        <span
          className="inline-block h-4 w-8 rounded border border-white/20"
          style={{ background: colour }}
        />
        {colour}
      </span>
    </div>
  );
}
