import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, FileText, Receipt, Users, Menu, X, Search,
  ClipboardList, Truck, ClipboardCheck, Route, MessageCircle, Mail,
  ScrollText, CreditCard, Settings, ShieldAlert, Bell, Download, LogOut, Sparkles,
  Layers, ScanLine, Wallet, Gauge, Wrench, Moon, Sun, BarChart2, Activity, Box, Globe, Building2,
  AlertTriangle, Zap, Bot, ShieldCheck, Ship,
} from "lucide-react";

// ✅ FIXED: Went up two folders (../../) to correctly reach src/lib and src/assets
import { cn } from "../../lib/utils"; 
import logo from "../../assets/logo.png";
import { useTenant } from "../../contexts/TenantContext";
import { useAuth } from "../../contexts/AuthContext";
import { isImpersonating, impersonatedTenantName, exitImpersonation } from "../../lib/impersonation";
import { useTheme } from "../../contexts/ThemeContext";
import {
  normalizeTenantNavPermissions,
  type TenantNavPermissionKey,
} from "../../lib/tenantUserPermissions";

type NavItem = {
  label: string;
  desc: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  section: "CORE" | "OPS" | "COMMUNICATIONS" | "BILLING" | "AI" | "ADMIN";
  /** Gate visibility/access against the tenant nav-permission matrix. Items
   *  without a key are always visible (e.g. operational pages without a
   *  dedicated permission flag). */
  perm?: TenantNavPermissionKey;
  /** Restrict to tenant-admin roles only (admin landing surfaces). */
  adminOnly?: boolean;
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

// --- Helper Components ---

function SidebarSection(props: {
  title: string;
  items: NavItem[];
  currentPath: string;
  onNavigate: () => void;
}) {
  if (!props.items || props.items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 px-4 text-[10px] font-black uppercase tracking-[0.24em] text-white/40">
        {props.title}
      </div>

      <div className="space-y-1.5 px-2">
        {props.items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={props.onNavigate}
              className={({ isActive }) =>
                cn(
                  "group flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
                  isActive
                    ? "border-sky-300/20 bg-sky-300/10 text-white shadow-[0_0_15px_rgba(125,211,252,0.05)]"
                    : "border-transparent bg-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                )
              }
            >
              <div className="mt-0.5 rounded-xl border border-white/10 bg-white/[0.05] p-2">
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold leading-5">{item.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-white/45">
                  {item.desc}
                </div>
              </div>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent(props: {
  grouped: Record<string, NavItem[]>;
  currentPath: string;
  onNavigate: () => void;
  canInstall: boolean;
  onInstall: () => void;
  onLogout: () => void;
  brandName: string;
  brandLogoUrl: string | null;
}) {
  const sections: ("CORE" | "OPS" | "COMMUNICATIONS" | "BILLING" | "AI" | "ADMIN")[] = 
    ["CORE", "OPS", "COMMUNICATIONS", "BILLING", "AI", "ADMIN"];

  return (
    <div className="flex h-full flex-col bg-[#081120]">
      <div className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <img 
            src={props.brandLogoUrl ?? logo} 
            alt={`${props.brandName} logo`} 
            className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 object-cover" 
            onError={(e) => { (e.target as HTMLImageElement).src = logo; }}
          />
          <div className="min-w-0">
            <div className="text-lg font-black tracking-tight text-white uppercase italic">
              {props.brandName}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/50">
              Tactical OS v1.8.2
            </div>
          </div>
        </div>
      </div>

      <div role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto py-6 custom-scrollbar min-h-0">
        {sections.map((sec) => (
          <SidebarSection 
            key={sec} 
            title={sec} 
            items={props.grouped[sec] || []} 
            currentPath={props.currentPath} 
            onNavigate={props.onNavigate} 
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-white/10 p-4 space-y-2 bg-[#081120]">
        <button 
          onClick={props.onInstall}
          aria-label="Install application"
          disabled={!props.canInstall} 
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold transition", 
            props.canInstall 
              ? "border-sky-300/20 bg-sky-300/10 text-sky-100 cursor-pointer hover:bg-sky-300/20" 
              : "border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"
          )}
        >
          <Download className="h-4 w-4" /> Install Application
        </button>
        <button 
          onClick={props.onLogout}
          aria-label="Log out"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/10 bg-red-500/5 px-4 py-3 text-xs font-bold text-red-400/80 transition hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" /> Terminate Session
        </button>
      </div>
    </div>
  );
}

// --- Main Layout Component ---

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { branding } = useTenant();
  const { user, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handler = (e: Event) => { 
      e.preventDefault(); 
      setInstallPrompt(e as DeferredInstallPrompt); 
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  const nav = useMemo((): NavItem[] => [
    { section: "CORE", label: "Dashboard", desc: "Executive command", to: "/dashboard", icon: LayoutDashboard, perm: "dashboard" },
    { section: "CORE", label: "Shipments", desc: "Operations console", to: "/shipments", icon: Package, perm: "shipments" },
    { section: "CORE", label: "Waybill Inbox", desc: "OCR Verification", to: "/waybills/inbox", icon: Search, perm: "waybillInbox" },
    { section: "CORE", label: "Scan Capture", desc: "Barcode & OCR intake", to: "/waybills/scan", icon: ScanLine, perm: "waybillInbox" },
    { section: "CORE", label: "Batch Scan", desc: "Bulk status at hub", to: "/waybills/batch-scan", icon: ScanLine, perm: "waybillInbox" },
    { section: "CORE", label: "Waybills", desc: "Digital register", to: "/waybills", icon: ClipboardList, perm: "waybills" },
    { section: "CORE", label: "Clients", desc: "Enterprise data", to: "/clients", icon: Users, perm: "clients" },
    
    { section: "OPS", label: "Ops Command Centre", desc: "Today's stats & driver board", to: "/operations", icon: Activity, perm: "driverDispatch" },
    { section: "OPS", label: "Warehouse Hub",       desc: "Intake, manifests & POD",      to: "/warehouse",          icon: Box,      perm: "waybillInbox"  },
    { section: "OPS", label: "Client Hub",          desc: "Quotes, pickups & comms",       to: "/customer-service",   icon: Users,    perm: "quotes"        },
    { section: "OPS", label: "Driver Chat",          desc: "Message drivers in the field",  to: "/driver-chat",        icon: MessageCircle, perm: "driverDispatch" },
    { section: "OPS", label: "Driver Home",         desc: "My jobs, pickups & portal",     to: "/driver-home",        icon: Truck,    perm: "podDeliveries" },
    { section: "OPS", label: "Field Delivery",      desc: "Live fleet & driver portal",    to: "/field-delivery",     icon: Truck,    perm: "driverDispatch" },
    { section: "OPS", label: "Collections", desc: "AI-Ranked scheduling", to: "/collections", icon: Truck, perm: "collections" },
    { section: "OPS", label: "POD / Deliveries", desc: "Proof of delivery", to: "/pod-deliveries", icon: ClipboardCheck, perm: "podDeliveries" },
    { section: "OPS", label: "Driver Dispatch", desc: "Live route execution", to: "/driver-dispatch", icon: Route, perm: "driverDispatch" },
    { section: "OPS", label: "Route Optimizer", desc: "AI stop sequencing", to: "/routes", icon: Route, perm: "driverDispatch" },
    { section: "OPS", label: "Fleet Maintenance", desc: "Vehicle service tracker", to: "/fleet", icon: Wrench, perm: "driverDispatch" },
    { section: "OPS", label: "Manifests", desc: "Load & route grouping", to: "/manifests", icon: Layers, perm: "waybillInbox" },
    { section: "OPS", label: "Depots", desc: "Hubs & branch locations", to: "/depots", icon: Building2, perm: "driverDispatch" },
    { section: "OPS", label: "Freight Forwarding", desc: "Import/export shipments (Enterprise)", to: "/forwarding", icon: Ship, adminOnly: true },
    
    { section: "COMMUNICATIONS", label: "WhatsApp", desc: "Tactical messaging", to: "/whatsapp", icon: MessageCircle, perm: "whatsapp" },
    { section: "COMMUNICATIONS", label: "Email Hub", desc: "Unified inbox", to: "/email", icon: Mail, perm: "email" },
    
    { section: "BILLING", label: "Finance Home", desc: "Revenue, AR aging, clients", to: "/finance", icon: BarChart2, perm: "invoices" },
    { section: "BILLING", label: "Rate Cards", desc: "Commercial pricing", to: "/rate-cards", icon: CreditCard, perm: "rateCards" },
    { section: "BILLING", label: "Rate Shopping", desc: "Compare carrier quotes", to: "/rate-shopping", icon: Gauge, perm: "rateCards" },
    { section: "BILLING", label: "Billing Batches", desc: "Audit & Recon", to: "/billing-batches", icon: FileText, perm: "billingBatches" },
    { section: "BILLING", label: "Invoices", desc: "Revenue tracking", to: "/invoices", icon: Receipt, perm: "invoices" },
    { section: "BILLING", label: "Quotes", desc: "Conversion engine", to: "/quotes", icon: ScrollText, perm: "quotes" },
    { section: "BILLING", label: "Credit Control", desc: "Arrears management", to: "/credit-control", icon: ShieldAlert, perm: "creditControl" },
    { section: "BILLING", label: "COD Reconciliation", desc: "Cash on delivery tracking", to: "/cod", icon: Wallet, perm: "billingBatches" },
    
    { section: "AI", label: "AI Control Tower",        desc: "6-Claw Mesh Status",          to: "/ai-control-tower", icon: Sparkles,    perm: "aiControlTower"   },
    { section: "AI", label: "CLAW Autopilot",           desc: "Autonomous operations (Enterprise)", to: "/autopilot",  icon: Bot,         perm: "aiControlTower"   },
    { section: "AI", label: "High Risk Queue",          desc: "Exception management",         to: "/high-risk-queue",  icon: ShieldAlert, perm: "risksExceptions"  },
    
    { section: "ADMIN", label: "Admin Home", desc: "Tenant manager landing", to: "/admin", icon: LayoutDashboard, adminOnly: true },
    { section: "ADMIN", label: "User Roles", desc: "Permission matrix", to: "/user-roles", icon: Users, perm: "usersRoles" },
    { section: "ADMIN", label: "Integrations", desc: "API keys & webhooks", to: "/settings/integrations", icon: Settings, perm: "settings" },
    { section: "ADMIN", label: "Single Sign-On", desc: "OIDC SSO (Enterprise)", to: "/settings/sso", icon: ShieldCheck, adminOnly: true },
    { section: "ADMIN", label: "Settings", desc: "System configuration", to: "/settings", icon: Settings, perm: "settings" },
  ], []);

  // Enforce the tenant nav-permission matrix (role defaults, overridable by any
  // explicit per-user permissions the backend attaches to /auth/me). This is the
  // single source of truth shared with RequirePermission at the route layer.
  const perms = useMemo(
    () =>
      normalizeTenantNavPermissions(
        (user as any)?.permissions ?? (user as any)?.navPermissions,
        user?.role,
      ),
    [user],
  );

  const isTenantAdmin = useMemo(() => {
    const role = String(user?.role || "").toUpperCase();
    return (
      ["ADMIN", "COMPANY_ADMIN", "TENANT_ADMIN", "SUPER_ADMIN", "ULTIMATE_OWNER"].includes(role) ||
      Boolean((user as any)?.isSuperAdmin) ||
      Boolean((user as any)?.isUltimateOwner)
    );
  }, [user]);

  const visibleNav = useMemo(
    () =>
      nav.filter((item) => {
        if (item.adminOnly && !isTenantAdmin) return false;
        if (item.perm && isAuthenticated && !perms[item.perm]) return false;
        return true;
      }),
    [nav, perms, isTenantAdmin, isAuthenticated],
  );

  const grouped = useMemo(() => ({
    CORE: visibleNav.filter(i => i.section === "CORE"),
    OPS: visibleNav.filter(i => i.section === "OPS"),
    COMMUNICATIONS: visibleNav.filter(i => i.section === "COMMUNICATIONS"),
    BILLING: visibleNav.filter(i => i.section === "BILLING"),
    AI: visibleNav.filter(i => i.section === "AI"),
    ADMIN: visibleNav.filter(i => i.section === "ADMIN"),
  }), [visibleNav]);

  const currentLabel = useMemo(() => {
    const found = [...nav].sort((a,b) => b.to.length - a.to.length).find(i => location.pathname.startsWith(i.to));
    return found?.label ?? "FlowOps";
  }, [location.pathname, nav]);

  const handleLogout = () => { 
    localStorage.clear(); 
    navigate("/login", { replace: true }); 
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice || { outcome: 'dismissed' };
    if (outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <div className="flex h-screen bg-[#07111f] text-white overflow-hidden font-sans lm-main">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[300px] shrink-0 border-r border-white/5 bg-[#081120] xl:flex xl:flex-col">
        <SidebarContent 
          grouped={grouped} 
          currentPath={location.pathname} 
          onNavigate={() => setMobileOpen(false)} 
          canInstall={!!installPrompt} 
          onInstall={handleInstall} 
          onLogout={handleLogout}
          brandName={branding.brandName}
          brandLogoUrl={branding.logoUrl}
        />
      </aside>

      {/* Main UI Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {isImpersonating() ? (
          <div className="flex items-center justify-between gap-3 bg-amber-500/15 px-6 py-2 text-sm text-amber-100 border-b border-amber-400/20">
            <div className="font-bold">
              Viewing as <span className="underline">{impersonatedTenantName() || "tenant"}</span> — actions affect this tenant's data.
            </div>
            <button
              onClick={() => {
                exitImpersonation();
                window.location.href = "/owner/dashboard";
              }}
              className="rounded-xl border border-amber-400/30 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-50 hover:bg-amber-500/30"
            >
              Exit to Owner Console
            </button>
          </div>
        ) : null}
        <header className="z-30 border-b border-white/5 bg-[#081120]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center shrink-0 lm-header">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="xl:hidden p-2 rounded-xl border border-white/10 bg-white/5 text-sky-400">
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">System Sector</div>
              <div className="text-xl font-black tracking-tight text-white">{currentLabel}</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            AI Monitoring Active
          </div>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="ml-2 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main role="main" aria-label="Page content" className="flex-1 overflow-y-auto bg-[#07111f] relative custom-scrollbar">
          {/* ── Trial Banner ── */}
          {(() => {
            const co = user?.company as any;
            if (!co) return null;
            const days: number | null = co.trialDaysLeft ?? null;
            if (days === null) return null;           // paid plan, no banner
            if (co.trialExpired) return (
              <div className="flex items-center justify-between gap-3 bg-red-500/15 px-6 py-2.5 text-sm text-red-200 border-b border-red-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  <span><strong>Your 14-day free trial has expired.</strong> Upgrade to keep access to all features.</span>
                </div>
                <button
                  onClick={() => window.open(`https://wa.me/27814065725?text=${encodeURIComponent('Hi! My FlowOps trial has expired. I\'d like to upgrade to Professional.')}`, '_blank')}
                  className="flex items-center gap-1.5 shrink-0 rounded-xl bg-red-500 text-white px-4 py-1.5 text-xs font-black hover:bg-red-400 transition"
                >
                  <Zap className="h-3.5 w-3.5" /> Upgrade Now
                </button>
              </div>
            );
            if (days <= 7) return (
              <div className="flex items-center justify-between gap-3 bg-amber-500/15 px-6 py-2.5 text-sm text-amber-200 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span><strong>{days} day{days !== 1 ? 's' : ''} left in your free trial.</strong> Upgrade before it expires to keep all your data and features.</span>
                </div>
                <button
                  onClick={() => window.open(`https://wa.me/27814065725?text=${encodeURIComponent(`Hi! My FlowOps trial expires in ${days} days. I'd like to upgrade to Professional.`)}`, '_blank')}
                  className="flex items-center gap-1.5 shrink-0 rounded-xl bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-black hover:bg-amber-400 transition"
                >
                  <Zap className="h-3.5 w-3.5" /> Upgrade Now
                </button>
              </div>
            );
            // 8–14 days — subtle info banner
            return (
              <div className="flex items-center justify-between gap-3 bg-sky-500/8 px-6 py-2 text-xs text-sky-300/70 border-b border-sky-500/10">
                <span>🎉 Free trial active — <strong>{days} days remaining</strong>. You have full access to all Professional features.</span>
                <button
                  onClick={() => window.open(`https://wa.me/27814065725?text=${encodeURIComponent('Hi! I want to upgrade my FlowOps account to Professional.')}`, '_blank')}
                  className="shrink-0 text-sky-400 hover:text-sky-300 font-bold underline underline-offset-2 transition"
                >
                  Upgrade early →
                </button>
              </div>
            );
          })()}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(56,189,248,0.03),transparent)] pointer-events-none" />
          <div className="relative z-10 p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[300px] border-r border-white/10 bg-[#081120] shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-4 top-4 z-50 p-2 text-white/20 hover:text-white transition">
              <X className="h-6 w-6" />
            </button>
            <SidebarContent 
              grouped={grouped} 
              currentPath={location.pathname} 
              onNavigate={() => setMobileOpen(false)} 
              canInstall={!!installPrompt} 
              onInstall={handleInstall} 
              onLogout={handleLogout}
              brandName={branding.brandName}
              brandLogoUrl={branding.logoUrl}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
