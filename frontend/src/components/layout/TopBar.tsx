import React from "react";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "../ui/button";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../../lib/tenantAdminFullAccess';
type Props = {
  title: string;
  subtitle?: string;
  onOpenMobileMenu: () => void;
  onOpenCommand: () => void;
};

export default function TopBar({ title, subtitle, onOpenMobileMenu, onOpenCommand }: Props) {
  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="truncate text-xs text-slate-500">{subtitle}</div> : null}
          </div>
        </div>

        <Button variant="outline" onClick={onOpenCommand}>
          <Sparkles className="mr-2 h-4 w-4" />
          AI Command
          <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
            Ctrl + K
          </span>
        </Button>
      </div>
    </div>
  );
}
