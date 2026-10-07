import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The top of a page: title, what it is for, and the actions that apply to it.
 *
 * Every page in this app wrote this block by hand, so the spacing, heading
 * level and action alignment drifted page to page. This fixes the shape and,
 * more importantly, fixes the heading level: the page title is an `h1` exactly
 * once per page, which is what a screen reader uses to tell a user where they
 * have landed.
 */
export interface PageHeaderProps {
  title: string;
  /** One line on what this page is for, or what period it covers. */
  description?: string;
  /** Rendered opposite the title. Buttons, filters, exports. */
  actions?: React.ReactNode;
  /** Rendered under the description: tabs, filters, a period selector. */
  toolbar?: React.ReactNode;
  /** Use `h2` when this header sits inside a page that already has an `h1`. */
  as?: 'h1' | 'h2';
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  toolbar,
  as: Heading = 'h1',
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Heading className="truncate text-lg font-semibold text-white">{title}</Heading>
          {description ? (
            <p className="max-w-2xl text-sm text-slate-400">{description}</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
    </header>
  );
}

PageHeader.displayName = 'PageHeader';
