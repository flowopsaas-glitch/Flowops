import React from "react";

export type CommandCenterHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Short trust / capability chips (e.g. “Live ETAs”, “Tenant-isolated”). */
  trustChips?: string[];
  children?: React.ReactNode;
  className?: string;
};

/**
 * Shared “command surface” header for Dashboard, Dispatch, and ops pages.
 * Matches the in-app premium shell (glass, wide type, operational clarity).
 */
export function CommandCenterHeader({
  eyebrow,
  title,
  subtitle,
  trustChips,
  children,
  className = "",
}: CommandCenterHeaderProps) {
  return (
    <header
      className={`fo-page-polish mb-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-400/95">
            {eyebrow}
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl leading-[1.05]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-white/65">
              {subtitle}
            </p>
          ) : null}
          {trustChips && trustChips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {trustChips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/75"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {children ? (
          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-auto lg:max-w-[min(100%,640px)]">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
