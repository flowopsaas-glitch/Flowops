import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { DRIVER_LANGUAGES, setDriverLanguage } from "../i18n";

interface Props {
  /** Class for the outer wrapper. Defaults to a compact inline style. */
  className?: string;
}

export default function LanguageSwitcher({ className }: Props) {
  const { i18n } = useTranslation();
  const current = DRIVER_LANGUAGES.find((l) => l.code === i18n.language) ?? DRIVER_LANGUAGES[0];

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Globe size={14} className="text-slate-400 shrink-0" />
      <select
        value={current.code}
        onChange={(e) => setDriverLanguage(e.target.value)}
        aria-label="Select language"
        className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white outline-none cursor-pointer appearance-none"
      >
        {DRIVER_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} className="bg-slate-900 text-white normal-case tracking-normal font-normal text-sm">
            {lang.native}
          </option>
        ))}
      </select>
    </div>
  );
}
