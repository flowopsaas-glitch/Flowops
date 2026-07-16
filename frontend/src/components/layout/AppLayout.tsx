import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, FileText, Receipt, Users, Menu, X, Search,
  ClipboardList, Truck, ClipboardCheck, Route, MessageCircle, Mail,
  ScrollText, CreditCard, Settings, ShieldAlert, Bell, Download, LogOut, Sparkles,
  Layers, ScanLine, Wallet, Gauge, Wrench, Moon, Sun, BarChart2, BarChart3, Activity, Box, Globe, Building2,
  AlertTriangle, Zap, Bot, ShieldCheck, Ship, RotateCcw, Calculator, Crown, LifeBuoy, PackageCheck,
  PanelLeftClose, PanelLeftOpen, ChevronDown, Lock, ArrowUpRight, PieChart, Brain,
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
import { getEntitlements, type Entitlements } from "../../api/billingApi";
import { featureTier } from "../../lib/planMeta";

type NavItem = {
  label: string;
  desc: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  section: "CORE" | "OPS" | "COMMUNICATIONS" | "BILLING" | "INSIGHTS" | "AI" | "ADMIN";
  /** Gate visibility/access against the tenant nav-permission matrix. Items
   *  without a key are always visible (e.g. operational pages without a
   *  dedicated permission flag). */
  perm?: TenantNavPermissionKey;
  /** Restrict to tenant-admin roles only (admin landing surfaces). */
  adminOnly?: boolean;
  /** Hide unless the tenant's PLAN entitles this feature (plan-tier gate). */
  entitlement?: string;
  /** Computed at render time: plan doesn't include this feature → show as a
   *  locked upsell teaser instead of hiding it. */
  locked?: boolean;
  /** Computed at render time: which tier unlocks this item (PRO/ENTERPRISE). */
  tier?: "PRO" | "ENTERPRISE" | null;
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
  collapsed?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  if (!props.items || props.items.length === 0) return null;
  const { collapsed, open = true } = props;

  return (
    <div className="mb-4">
      {!collapsed && (
        <button
          onClick={props.onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${props.title} section`}
          className="mb-2 flex w-full items-center justify-between rounded-lg px-4 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/40 transition hover:bg-white/[0.04] hover:text-white/70"
        >
          <span>{props.title}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open ? "" : "-rotate-90")} />
        </button>
      )}

      {(collapsed || open) && (
        <div className={cn("space-y-1.5 px-2", !collapsed && "fx-reveal")}>
          {props.items.filter(Boolean).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={props.onNavigate}
                title={collapsed ? (item.locked ? `${item.label} — ${item.tier} plan` : item.label) : undefined}
                aria-label={item.locked ? `${item.label} (locked — ${item.tier} plan)` : item.label}
                className={({ isActive }) =>
                  cn(
                    "group flex items-start gap-3 rounded-2xl border transition",
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-3",
                    item.locked
                      ? "border-transparent bg-transparent text-white/35 hover:border-amber-300/20 hover:bg-amber-300/[0.04] hover:text-white/60"
                      : isActive
                      ? "border-sky-300/20 bg-sky-300/10 text-white shadow-[0_0_15px_rgba(125,211,252,0.05)]"
                      : "border-transparent bg-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                  )
                }
              >
                <div className={cn(
                  "relative mt-0.5 rounded-xl border p-2",
                  item.locked ? "border-amber-300/15 bg-amber-300/[0.04]" : "border-white/10 bg-white/[0.05]"
                )}>
                  <Icon className="h-4 w-4" />
                  {item.locked && collapsed && (
                    <span className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-500 ring-2 ring-[#081120]">
                      <Lock className="h-2 w-2 text-slate-950" />
                    </span>
                  )}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold leading-5">{item.label}</span>
                      {item.locked && item.tier && (
                        <span className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                          item.tier === "ENTERPRISE"
                            ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30"
                            : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30"
                        )}>
                          {item.tier === "ENTERPRISE" ? "ENT" : "PRO"}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-4 text-white/45">
                      {item.locked ? "Upgrade to unlock" : item.desc}
                    </div>
                  </div>
                )}

                {!collapsed && item.locked && (
                  <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                )}
              </NavLink>
            );
          })}
        </div>
      )}
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
  collapsed?: boolean;
  ent?: Entitlements | null;
}) {
  const sections: ("CORE" | "OPS" | "COMMUNICATIONS" | "BILLING" | "INSIGHTS" | "AI" | "ADMIN")[] = 
    ["CORE", "OPS", "COMMUNICATIONS", "BILLING", "INSIGHTS", "AI", "ADMIN"];
  const { collapsed } = props;

  // Accordion: which sections are open. Default open; a section is folded only
  // when explicitly set false. Persisted across reloads.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("flowops.sidebar.sections") || "{}"); } catch { return {}; }
  });
  const toggleSection = (s: string) =>
    setOpenSections((prev) => {
      const next = { ...prev, [s]: prev[s] === false ? true : false };
      try { localStorage.setItem("flowops.sidebar.sections", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  return (
    <div className="flex h-full flex-col bg-[#081120]">
      <div className={cn("shrink-0 border-b border-white/10 py-5", collapsed ? "px-3" : "px-5")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <img 
            src={props.brandLogoUrl ?? logo} 
            alt={`${props.brandName} logo`} 
            className="h-12 w-12 rounded-2xl border border-white/10 bg-white object-contain p-1 shrink-0" 
            onError={(e) => { (e.target as HTMLImageElement).src = logo; }}
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-lg font-black tracking-tight text-white uppercase italic">
                {props.brandName}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/50">
                Tactical OS v1.8.2
              </div>
            </div>
          )}
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
            collapsed={collapsed}
            open={openSections[sec] !== false}
            onToggle={() => toggleSection(sec)}
          />
        ))}
      </div>

      <div className={cn("shrink-0 border-t border-white/10 space-y-2 bg-[#081120]", collapsed ? "p-2" : "p-4")}>
        {/* ── Plan status chip + upgrade CTA ── */}
        {props.ent && (
          collapsed ? (
            <NavLink
              to="/billing/plans"
              onClick={props.onNavigate}
              title={`${props.ent.planName} plan`}
              aria-label={`${props.ent.planName} plan — manage subscription`}
              className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-sky-300 transition hover:bg-white/10"
            >
              <Crown className="h-4 w-4" />
            </NavLink>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-400/10 ring-1 ring-sky-400/20">
                    <Crown className="h-3.5 w-3.5 text-sky-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-white">{props.ent.planName} plan</div>
                    <div className="truncate text-[10px] font-bold text-white/40">
                      {props.ent.onTrial
                        ? `Trial · ${props.ent.trialDaysLeft} day${props.ent.trialDaysLeft !== 1 ? "s" : ""} left`
                        : props.ent.plan === "enterprise"
                        ? "All features unlocked"
                        : "Manage subscription"}
                    </div>
                  </div>
                </div>
              </div>
              {props.ent.plan !== "enterprise" && (
                <NavLink
                  to="/billing/plans"
                  onClick={props.onNavigate}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500/20 to-violet-500/20 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/30 transition hover:from-sky-500/30 hover:to-violet-500/30"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {props.ent.onTrial ? "Choose a plan" : "Upgrade"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </NavLink>
              )}
            </div>
          )
        )}
        <button 
          onClick={props.onInstall}
          aria-label="Install application"
          title={collapsed ? "Install application" : undefined}
          disabled={!props.canInstall} 
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl border text-xs font-bold transition", 
            collapsed ? "px-2 py-2.5" : "px-4 py-3",
            props.canInstall 
              ? "border-sky-300/20 bg-sky-300/10 text-sky-100 cursor-pointer hover:bg-sky-300/20" 
              : "border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"
          )}
        >
          <Download className="h-4 w-4" /> {!collapsed && "Install Application"}
        </button>
        <button 
          onClick={props.onLogout}
          aria-label="Log out"
          title={collapsed ? "Terminate session" : undefined}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/10 bg-red-500/5 text-xs font-bold text-red-400/80 transition hover:bg-red-500/10",
            collapsed ? "px-2 py-2.5" : "px-4 py-3"
          )}
        >
          <LogOut className="h-4 w-4" /> {!collapsed && "Terminate Session"}
        </button>
      </div>
    </div>
  );
}

// --- Main Layout Component ---

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("flowops.sidebar.collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("flowops.sidebar.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  // Plan-tier gate: null until loaded (we don't lock paid items before we know).
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    let alive = true;
    getEntitlements()
      .then((e) => { if (alive) setEnt(e ?? null); })
      .catch(() => { if (alive) setEnt(null); });
    return () => { alive = false; };
  }, []);
  const features = ent?.features ?? null;
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
    { section: "CORE", label: "Bulk Import", desc: "CSV waybill upload", to: "/waybills/bulk-import", icon: ClipboardList, perm: "waybillInbox" },
    { section: "CORE", label: "Waybills", desc: "Digital register", to: "/waybills", icon: ClipboardList, perm: "waybills" },
    { section: "CORE", label: "Clients", desc: "Enterprise data", to: "/clients", icon: Users, perm: "clients" },
    
    { section: "OPS", label: "Ops Command Centre", desc: "Today's stats & driver board", to: "/operations", icon: Activity, perm: "driverDispatch" },
    { section: "OPS", label: "Warehouse Hub",       desc: "Intake, manifests & POD",      to: "/warehouse",          icon: Box,      perm: "waybillInbox"  },
    { section: "OPS", label: "Client Hub",          desc: "Quotes, pickups & comms",       to: "/customer-service",   icon: Users,    perm: "quotes"        },
    { section: "OPS", label: "Driver Chat",          desc: "Message drivers in the field",  to: "/driver-chat",        icon: MessageCircle, perm: "driverDispatch" },
    { section: "OPS", label: "Driver Home",         desc: "My jobs, pickups & portal",     to: "/driver-home",        icon: Truck,    perm: "podDeliveries" },
    { section: "OPS", label: "Field Delivery",      desc: "Live fleet & driver portal",    to: "/field-delivery",     icon: Truck,    perm: "driverDispatch" },
    { section: "OPS", label: "Collections", desc: "AI-Ranked scheduling", to: "/collections", icon: Truck, perm: "collections" },
    { section: "OPS", label: "Courier Management", desc: "Client orders + AI orchestration (Enterprise)", to: "/couriers", icon: PackageCheck, entitlement: "courierManagement" },
    { section: "OPS", label: "Carriers & Procurement", desc: "Lines, airlines & buy-rate contracts", to: "/carriers", icon: Ship, perm: "rateCards" },
    { section: "OPS", label: "Returns / RMA", desc: "Collect, inspect, refund, restock", to: "/returns", icon: RotateCcw, perm: "returns", entitlement: "returns" },
    { section: "OPS", label: "POD / Deliveries", desc: "Proof of delivery", to: "/pod-deliveries", icon: ClipboardCheck, perm: "podDeliveries" },
    { section: "OPS", label: "Driver Dispatch", desc: "Live route execution", to: "/driver-dispatch", icon: Route, perm: "driverDispatch" },
    { section: "OPS", label: "Route Optimizer", desc: "AI stop sequencing", to: "/routes", icon: Route, perm: "driverDispatch", entitlement: "routeOptimization" },
    { section: "OPS", label: "Fleet Maintenance", desc: "Vehicle service tracker", to: "/fleet", icon: Wrench, perm: "driverDispatch" },
    { section: "OPS", label: "ESG & Carbon", desc: "Fleet emissions & compliance", to: "/esg", icon: Activity, perm: "driverDispatch" },
    { section: "OPS", label: "Manifests", desc: "Load & route grouping", to: "/manifests", icon: Layers, perm: "waybillInbox" },
    { section: "OPS", label: "Depots", desc: "Hubs & branch locations", to: "/depots", icon: Building2, perm: "driverDispatch" },
    { section: "OPS", label: "Freight Forwarding", desc: "Import/export shipments (Enterprise)", to: "/forwarding", icon: Ship, adminOnly: true, entitlement: "freightForwarding" },
    { section: "OPS", label: "SARS EDI Setup", desc: "Customs transmission config", to: "/forwarding/sars-edi", icon: Globe, adminOnly: true, entitlement: "freightForwarding" },
    
    { section: "COMMUNICATIONS", label: "WhatsApp", desc: "Tactical messaging", to: "/whatsapp", icon: MessageCircle, perm: "whatsapp", entitlement: "whatsapp" },
    { section: "COMMUNICATIONS", label: "Email Hub", desc: "Unified inbox", to: "/email", icon: Mail, perm: "email", entitlement: "emailHub" },
    { section: "COMMUNICATIONS", label: "Client Queries", desc: "Customer questions & tickets", to: "/communications/client-queries", icon: MessageCircle, perm: "clientQueries" },
    
    { section: "BILLING", label: "Finance Home", desc: "Revenue, AR aging, clients", to: "/finance", icon: BarChart2, perm: "invoices" },
    { section: "BILLING", label: "Rate Cards", desc: "Commercial pricing", to: "/rate-cards", icon: CreditCard, perm: "rateCards" },
    { section: "BILLING", label: "Rate Shopping", desc: "Compare carrier quotes", to: "/rate-shopping", icon: Gauge, perm: "rateCards", entitlement: "rateShopping" },
    { section: "BILLING", label: "Billing Batches", desc: "Audit & Recon", to: "/billing-batches", icon: FileText, perm: "billingBatches" },
    { section: "BILLING", label: "Invoices", desc: "Revenue tracking", to: "/invoices", icon: Receipt, perm: "invoices" },
    { section: "BILLING", label: "Invoice Drafts", desc: "Review & approve before issue", to: "/invoice-drafts", icon: FileText, perm: "invoiceDrafts" },
    { section: "BILLING", label: "Quotes", desc: "Conversion engine", to: "/quotes", icon: ScrollText, perm: "quotes" },
    { section: "BILLING", label: "Credit Control", desc: "Arrears management", to: "/credit-control", icon: ShieldAlert, perm: "creditControl" },
    { section: "BILLING", label: "COD Reconciliation", desc: "Cash on delivery tracking", to: "/cod", icon: Wallet, perm: "billingBatches", entitlement: "codReconciliation" },
    { section: "BILLING", label: "Accounting", desc: "Notes, statements & Pastel export — AI assisted", to: "/accounting", icon: Calculator, perm: "accounting", entitlement: "accounting" },
    { section: "BILLING", label: "Disbursements", desc: "Duties paid for clients & recovery", to: "/disbursements", icon: Wallet, perm: "accounting", entitlement: "accounting" },
    { section: "BILLING", label: "Plans & Usage", desc: "Subscription, limits & upgrades", to: "/billing/plans", icon: Crown, perm: "invoices" },
    { section: "BILLING", label: "Client Portal Links", desc: "Customer booking portal access", to: "/billing/client-portal-links", icon: Globe, perm: "creditControl" },
    
    { section: "INSIGHTS", label: "Logistics Analytics", desc: "AI-powered delivery insights (Enterprise)", to: "/logistics-analytics", icon: BarChart3, entitlement: "logisticsAnalytics" },
    { section: "INSIGHTS", label: "Commercial Analytics", desc: "Pricing, profitability & revenue intelligence", to: "/commercial-analytics", icon: PieChart, entitlement: "commercialAnalytics" },
    { section: "INSIGHTS", label: "Warehouse Management", desc: "Inventory, pick/pack & AI optimization", to: "/wms", icon: Layers, entitlement: "warehouseManagement" },
    
    { section: "AI", label: "AI Control Tower",        desc: "6-Claw Mesh Status",          to: "/ai-control-tower", icon: Sparkles,    perm: "aiControlTower", entitlement: "aiControlTower"   },
    { section: "AI", label: "Ask FlowOps",              desc: "AI copilot — analytics Q&A",   to: "/ask",              icon: Bot,         perm: "copilot", entitlement: "copilot"          },
    { section: "AI", label: "CLAW Autopilot",           desc: "Autonomous operations (Enterprise)", to: "/autopilot",  icon: Bot,         perm: "aiControlTower", entitlement: "clawAutopilot"   },
    { section: "AI", label: "AI Support Agent",         desc: "Product help + live data (Enterprise)", to: "/support", icon: LifeBuoy, entitlement: "aiSupportAgent" },
    { section: "AI", label: "Fleet Intelligence",        desc: "Network balancing & demand AI",  to: "/fleet-intelligence", icon: Brain },
    { section: "AI", label: "High Risk Queue",          desc: "Exception management",         to: "/high-risk-queue",  icon: ShieldAlert, perm: "risksExceptions"  },
    
    { section: "ADMIN", label: "Admin Home", desc: "Tenant manager landing", to: "/admin", icon: LayoutDashboard, adminOnly: true },
    { section: "ADMIN", label: "Admin Approvals", desc: "Signup approval queue", to: "/admin/approvals", icon: ShieldCheck, adminOnly: true },
    { section: "ADMIN", label: "User Roles", desc: "Permission matrix", to: "/user-roles", icon: Users, perm: "usersRoles" },
    { section: "ADMIN", label: "Integrations", desc: "API keys, webhooks & store connectors", to: "/settings/integrations", icon: Settings, perm: "settings", entitlement: "api" },
    { section: "ADMIN", label: "Single Sign-On", desc: "OIDC SSO (Enterprise)", to: "/settings/sso", icon: ShieldCheck, adminOnly: true, entitlement: "sso" },
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
      nav
        .filter((item) => {
          if (item.adminOnly && !isTenantAdmin) return false;
          if (item.perm && isAuthenticated && !perms[item.perm]) return false;
          return true;
        })
        // Plan-tier gate: rather than hiding modules the tenant's plan doesn't
        // include, surface them as locked upsell teasers (world-class discovery
        // pattern). Role/admin gating above still hides what a user may never
        // access. Before entitlements load (features===null) nothing is locked.
        .map((item): NavItem => {
          const locked = Boolean(item.entitlement && features && !features[item.entitlement]);
          return locked ? { ...item, locked, tier: featureTier(item.entitlement) } : item;
        }),
    [nav, perms, isTenantAdmin, isAuthenticated, features],
  );

  const grouped = useMemo(() => ({
    CORE: visibleNav.filter(i => i.section === "CORE"),
    OPS: visibleNav.filter(i => i.section === "OPS"),
    COMMUNICATIONS: visibleNav.filter(i => i.section === "COMMUNICATIONS"),
    BILLING: visibleNav.filter(i => i.section === "BILLING"),
    INSIGHTS: visibleNav.filter(i => i.section === "INSIGHTS"),
    AI: visibleNav.filter(i => i.section === "AI"),
    ADMIN: visibleNav.filter(i => i.section === "ADMIN"),
  }), [visibleNav]);

  const currentLabel = useMemo(() => {
    const found = [...nav].filter(Boolean).sort((a,b) => b.to.length - a.to.length).find(i => location.pathname.startsWith(i.to));
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
      {/* Skip to main content — first keyboard tab stop for screen-reader/keyboard users */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Desktop Sidebar */}
      <aside className={cn("hidden shrink-0 border-r border-white/5 bg-[#081120] xl:flex xl:flex-col fx-sidebar", collapsed ? "w-[84px]" : "w-[300px]")}>
        <SidebarContent 
          grouped={grouped} 
          currentPath={location.pathname} 
          onNavigate={() => setMobileOpen(false)} 
          canInstall={!!installPrompt} 
          onInstall={handleInstall} 
          onLogout={handleLogout}
          brandName={branding.brandName}
          brandLogoUrl={branding.logoUrl}
          collapsed={collapsed}
          ent={ent}
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
            <button onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden xl:flex p-2 rounded-xl border border-white/10 bg-white/5 text-sky-400 hover:bg-white/10 transition">
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
            <button onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileOpen} className="xl:hidden p-2 rounded-xl border border-white/10 bg-white/5 text-sky-400">
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

        <main id="main-content" tabIndex={-1} role="main" aria-label="Page content" className="flex-1 overflow-y-auto bg-[#07111f] relative custom-scrollbar fx-ambient fx-grid">
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
                  onClick={() => window.open(`https://wa.me/27606592875?text=${encodeURIComponent('Hi! My FlowOps trial has expired. I\'d like to upgrade to Professional.')}`, '_blank')}
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
                  onClick={() => window.open(`https://wa.me/27606592875?text=${encodeURIComponent(`Hi! My FlowOps trial expires in ${days} days. I'd like to upgrade to Professional.`)}`, '_blank')}
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
                  onClick={() => window.open(`https://wa.me/27606592875?text=${encodeURIComponent('Hi! I want to upgrade my FlowOps account to Professional.')}`, '_blank')}
                  className="shrink-0 text-sky-400 hover:text-sky-300 font-bold underline underline-offset-2 transition"
                >
                  Upgrade early →
                </button>
              </div>
            );
          })()}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(56,189,248,0.03),transparent)] pointer-events-none" />
          <div className="relative z-10 p-6">
            <div key={location.pathname} className="fx-page">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[300px] border-r border-white/10 bg-[#081120] shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="absolute right-4 top-4 z-50 p-2 text-white/20 hover:text-white transition">
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
              ent={ent}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
