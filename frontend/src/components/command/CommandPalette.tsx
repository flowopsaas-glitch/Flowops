import React, { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { NavItem } from "../../lib/nav";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NavItem[];
  onNavigate: (page: string) => void;
};

const QUICK_ACTIONS = [
  { id: "ops_health", title: "Ops Health Check", hint: "Detect SLA risk + stale tracking + POD risk" },
  { id: "billing_audit", title: "Billing Audit (FREE AI)", hint: "Flags missing charges + margin risk" },
  { id: "route_whatif", title: "Route What-If Simulation", hint: "Estimate ETA impact of reroutes" },
];

export default function CommandPalette({ open, onOpenChange, items, onNavigate }: Props) {
  const [q, setQ] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = q.trim().toLowerCase();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setMessage(null);
    }
  }, [open]);

  const results = useMemo(() => {
    const navMatches = items.filter((it) => {
      const blob = `${it.name} ${it.description || ""} ${it.section} ${it.page}`.toLowerCase();
      return !query ? true : blob.includes(query);
    });

    const actionMatches = QUICK_ACTIONS.filter((a) => {
      const blob = `${a.title} ${a.hint}`.toLowerCase();
      return !query ? true : blob.includes(query);
    });

    return { navMatches: navMatches.slice(0, 10), actionMatches: actionMatches.slice(0, 6) };
  }, [items, query]);

  function runAction(id: string) {
    // Free AI placeholder actions are currently in preview mode.
    if (id === "ops_health") setMessage("Ops Health Check is currently available as a preview workflow. Full data wiring is coming soon.");
    if (id === "billing_audit") setMessage("Billing Audit is in preview mode. Full invoice and waybill analysis will be available in the next release.");
    if (id === "route_whatif") setMessage("Route What-If is currently a preview action. Route optimizer integration is planned for the next upgrade.");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="absolute left-1/2 top-16 w-[min(860px,92vw)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <Sparkles className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">FlowOps Command</div>
            <div className="text-xs text-slate-500">Navigate + ops actions (Ctrl+K)</div>
          </div>

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Try: "invoices", "drivers", "control tower", "audit"...'
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500">Navigate</div>
              <div className="mt-2 space-y-1">
                {results.navMatches.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.key}
                      onClick={() => {
                        onNavigate(it.page);
                        onOpenChange(false);
                      }}
                      className={cn("w-full rounded-xl px-3 py-2 text-left transition hover:bg-slate-50")}
                    >
                      <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-700">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {it.name}
                            {it.badge ? (
                              <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                                {it.badge}
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-slate-500">{it.description || it.section}</div>
                        </div>
                        {it.hotkey ? (
                          <div className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                            {it.hotkey}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-500">Ops Actions</div>
              <div className="mt-2 space-y-1">
                {results.actionMatches.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => runAction(a.id)}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.hint}</div>
                  </button>
                ))}
                {message ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {message}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">
                    These actions are currently preview workflows. Full backend integration is planned for the next release.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-1 pt-3 pb-2 text-xs text-slate-400">
            Tip: press <b>Esc</b> to close.
          </div>
        </div>
      </div>
    </div>
  );
}