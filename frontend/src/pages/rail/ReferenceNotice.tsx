import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

/** Identifies browse-only rail reference pages without implying live operational state. */
export default function ReferenceNotice({ children }: { children?: ReactNode }) {
  return (
    <aside
      role="note"
      aria-label="Reference material"
      className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100"
    >
      <BookOpen aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <strong>Reference view · read-only.</strong> This page presents source-derived material, not live
        railway state. Tabs, chapter selectors and filters only change what is displayed; they do not
        submit requests or update rail records. Source paths and hashes below identify provenance; source
        files are not downloadable from this view.
        {children ? <> {children}</> : null}
      </p>
    </aside>
  );
}
