// src/components/AppSidebar.tsx
import React, { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Truck,
  Route,
  FileText,
  Receipt,
  Users,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Settings,
  MapIcon,
  Sparkles,
  MessageCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { base44 } from "@/api";
import { clearSession } from "@/lib/session";

// Navigation entries whose destination has an active route in App.tsx.
// Stale links to legacy destinations (CustomerPortal, TrackShipment, DriverApp,
// ProductionProcesses, CapacityPlanning, MRPSystem, LocationAnalysis, Stock,
// DriverRequests, Deliveries) were removed in the 2026-10-07 release-readiness
// audit — those pages have no active route. See
// docs/RELEASE-READINESS-AUDIT-2026-10-07.md.
const navigation = [
  { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { name: "WhatsApp Hub", page: "WhatsAppHub", icon: MessageCircle },
  { name: "Carriers", page: "CarrierManagement", icon: Truck },
  { name: "Waybills", page: "Waybills", icon: FileText },
  { name: "Clients", page: "Clients", icon: Users },
  { name: "Live Tracking", page: "LiveTracking", icon: MapIcon },
  { name: "Route Optimizer", page: "RouteOptimizer", icon: Sparkles },
  { name: "Drivers", page: "Drivers", icon: Users },
  { name: "Routes", page: "Routes", icon: Route },
  { name: "Quotes", page: "Quotes", icon: FileText },
  { name: "Invoices", page: "Invoices", icon: Receipt },
];

type Props = {
  /** Your app's current page key, e.g. "Dashboard" | "Invoices" etc */
  currentPage: string;

  /** When a nav item is clicked */
  onNavigate: (page: string) => void;

  /** Optional: show brand/company name */
  brand?: string;
};

export default function AppSidebar({ currentPage, onNavigate, brand = "FlowOps" }: Props) {
  const [openMobile, setOpenMobile] = useState(false);

  const activeItem = useMemo(() => {
    return navigation.find((n) => n.page === currentPage) ?? null;
  }, [currentPage]);

  async function handleLogout() {
    // If base44 has a logout/session clear, use it; otherwise clear local storage
    try {
      // Some base44 clients expose auth.logout(); others don't.
      // This is safe even if it throws.
      if (base44?.auth?.logout) await base44.auth.logout();
    } catch {
      // ignore
    }

    try {
      // Atomic logout via the session module — clears the canonical key
      // AND every legacy key in one call.
      clearSession();
    } catch {
      // ignore
    }

    // Navigate somewhere sane
    onNavigate("Dashboard");
  }

  const SidebarContent = (
    <div className="h-full w-72 flex flex-col bg-slate-950/70 border-r border-white/10 backdrop-blur-xl">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-white/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white/90" />
          </div>
          <div className="leading-tight">
            <div className="text-white font-extrabold">{brand}</div>
            <div className="text-xs text-white/60">
              {activeItem ? activeItem.name : "Navigation"}
            </div>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setOpenMobile(false)}
          className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-white/80"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-auto px-3 py-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.page === currentPage;

            return (
              <button
                key={item.page}
                type="button"
                onClick={() => {
                  onNavigate(item.page);
                  setOpenMobile(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-2xl border text-left transition",
                  active
                    ? "bg-white/10 border-white/15 text-white"
                    : "bg-transparent border-transparent text-white/75 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-white" : "text-white/70")} />
                <span className="font-semibold text-sm flex-1">{item.name}</span>
                {active && <ChevronRight className="h-4 w-4 text-white/80" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white"
            onClick={() => {
              onNavigate("Settings");
              setOpenMobile(false);
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar button */}
      <div className="md:hidden p-3">
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-950/70 border border-white/10 text-white"
        >
          <Menu className="h-5 w-5" />
          <span className="font-extrabold">Menu</span>
        </button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-screen sticky top-0">{SidebarContent}</div>

      {/* Mobile drawer */}
      {openMobile && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpenMobile(false)}
          />
          <div className="absolute left-0 top-0 bottom-0">{SidebarContent}</div>
        </div>
      )}
    </>
  );
}


