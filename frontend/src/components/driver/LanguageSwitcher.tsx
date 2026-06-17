import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { DRIVER_LANGUAGES, setDriverLanguage } from "../../i18n";

/**
 * Compact language switcher for driver-facing pages.
 * Persists the choice to localStorage so it survives a reload.
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation("driver");
  const current = i18n.language;

  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5">
      <Globe size={13} className="text-white/50 shrink-0" />
      <select
        value={current}
        onChange={(e) => setDriverLanguage(e.target.value)}
        className="appearance-none bg-transparent text-[11px] font-black uppercase tracking-[0.12em] text-white/70 outline-none cursor-pointer pr-1"
        aria-label="Select language"
      >
        {DRIVER_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code} className="bg-slate-900 text-white normal-case">
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
