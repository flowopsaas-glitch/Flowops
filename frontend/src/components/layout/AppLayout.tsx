// frontend/src/components/layout/AppLayout.tsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { TrendingUp, 
  LayoutDashboard, Package, FileText, Receipt, Users, Menu, X, Search, BarChart3,
  ClipboardList, Truck, ClipboardCheck, Route, MessageCircle, Mail,
  ScrollText, CreditCard, Settings, ShieldAlert, Bell, Download, LogOut, 
  Sparkles, Layers, Building2, Key, Shield, FileSpreadsheet, Radio, Crown,
  MessageSquare, Bot, AlertTriangle, Inbox, PackageCheck, MapPin, Warehouse, ArrowLeftRight
} from "lucide-react";

import { cn } from "../../lib/utils";
import logo from "../../assets/logo.png";

type NavItem = {
  label: string;
  desc: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  section: "CORE" | "OPS" | "INVENTORY" | "COMMUNICATIONS" | "BILLING" | "AI" | "ADMIN";
  roles?: string[];
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
}) {
  const sections: ("CORE" | "OPS" | "INVENTORY" | "COMMUNICATIONS" | "BILLING" | "AI" | "ADMIN")[] = 
    ["CORE", "OPS", "INVENTORY", "COMMUNICATIONS", "BILLING", "AI", "ADMIN", "SUPERADMIN" as any];

  return (
    <div className="flex h-full flex-col bg-[#081120]">
      <div className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <img 
            src={logo} 
            alt="FlowOps" 
            className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 object-cover" 
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/48?text=FO'; }}
          />
          <div className="min-w-0">
            <div className="text-lg font-black tracking-tight text-white uppercase italic">FlowOps</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/50">Tactical OS v1.8.2</div>
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

      
      {/* 🤖 AI Intelligence */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          AI Intelligence
        </h3>
        <div className="space-y-1 px-2">
          <a href="/ai-features" className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-purple-500/10 hover:text-purple-300 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            AI Dashboard
          </a>
          <a href="/ai/fraud-detection" className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Fraud Detection
          </a>
          <a href="/ai/dynamic-pricing" className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-purple-500/10 hover:text-purple-300 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Dynamic Pricing
          </a>
          <a href="/pricing" className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-green-500/10 hover:text-green-300 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Pricing & Plans
          </a>
        </div>
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

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => { 
      e.preventDefault(); 
      setInstallPrompt(e as DeferredInstallPrompt); 
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  // ✅ FIXED: All paths now match App.tsx routes EXACTLY
  const nav: NavItem[] = useMemo(() => [
    // CORE
    { section: "CORE", label: "Dashboard", desc: "Executive command", to: "/dashboard", icon: LayoutDashboard },
    { section: "CORE", label: "Analytics", desc: "Advanced insights", to: "/analytics", icon: BarChart3, roles: ["ADMIN", "OWNER", "OPS", "DISPATCHER"] },
    { section: "CORE", label: "Shipments", desc: "Operations console", to: "/shipments", icon: Package },
    { section: "CORE", label: "Waybill Inbox", desc: "OCR Verification", to: "/waybills/inbox", icon: Inbox },
    { section: "CORE", label: "Waybills", desc: "Digital register", to: "/waybills", icon: ClipboardList },
    { section: "CORE", label: "Clients", desc: "Enterprise data", to: "/clients", icon: Users, roles: ["ADMIN", "OWNER", "SALES"] },
    { section: "CORE", label: "Notifications", desc: "System alerts", to: "/notifications", icon: Bell },
    
    // OPS
    { section: "OPS", label: "Collections", desc: "AI-Ranked scheduling", to: "/collections", icon: Truck },
    { section: "OPS", label: "POD / Deliveries", desc: "Proof of delivery", to: "/pod-deliveries", icon: ClipboardCheck },
    { section: "OPS", label: "Driver Dispatch", desc: "Live route execution", to: "/driver-dispatch", icon: Route },
    { section: "OPS", label: "Manifests", desc: "Load & route grouping", to: "/manifests", icon: Layers },
    { section: "OPS", label: "Live Tracking", desc: "Real-time GPS", to: "/live-tracking", icon: MapPin, roles: ["ADMIN", "OWNER", "OPS"] },

    // DISPATCHER FEATURES
    { section: "OPS", label: "🗺️ Live Fleet Map", desc: "Real-time driver tracking", to: "/fleet-map", icon: MapPin, roles: ["ADMIN", "OWNER", "OPS", "DISPATCHER"] },
    { section: "OPS", label: "📊 Driver Analytics", desc: "Performance metrics", to: "/driver-analytics", icon: TrendingUp, roles: ["ADMIN", "OWNER", "OPS", "DISPATCHER"] },
    { section: "OPS", label: "💬 Dispatch Chat", desc: "Driver communication", to: "/dispatch-chat", icon: MessageSquare, roles: ["ADMIN", "OWNER", "OPS", "DISPATCHER"] },

    
    // INVENTORY
    { section: "INVENTORY", label: "Inventory Dashboard", desc: "Stock command center", to: "/inventory", icon: LayoutDashboard, roles: ["ADMIN", "OWNER", "OPS"] },
    { section: "INVENTORY", label: "Items", desc: "Product catalog", to: "/inventory/items", icon: Package, roles: ["ADMIN", "OWNER", "OPS"] },
    { section: "INVENTORY", label: "Warehouses", desc: "Storage locations", to: "/inventory/warehouses", icon: Warehouse, roles: ["ADMIN", "OWNER", "OPS"] },
    { section: "INVENTORY", label: "Movements", desc: "Stock audit trail", to: "/inventory/movements", icon: ArrowLeftRight, roles: ["ADMIN", "OWNER", "OPS"] },
    { section: "INVENTORY", label: "Alerts", desc: "Low stock warnings", to: "/inventory/alerts", icon: AlertTriangle, roles: ["ADMIN", "OWNER", "OPS"] },
    
    // COMMUNICATIONS
    { section: "COMMUNICATIONS", label: "WhatsApp Hub", desc: "Tactical messaging", to: "/communications/whatsapp", icon: Radio, roles: ["ADMIN", "OWNER"] },
    { section: "COMMUNICATIONS", label: "Email Hub", desc: "Unified inbox", to: "/communications/email", icon: Mail, roles: ["ADMIN", "OWNER"] },
    { section: "COMMUNICATIONS", label: "Client Queries", desc: "Support tickets", to: "/communications/client-queries", icon: MessageSquare, roles: ["ADMIN", "OWNER"] },
    
    // BILLING
    { section: "BILLING", label: "Rate Cards", desc: "Commercial pricing", to: "/rate-cards", icon: CreditCard, roles: ["ADMIN", "OWNER", "SALES"] },
    { section: "BILLING", label: "Billing Batches", desc: "Audit & Recon", to: "/billing/batches", icon: FileSpreadsheet, roles: ["ADMIN", "OWNER", "SALES"] },
    { section: "BILLING", label: "Invoice Drafts", desc: "Pending invoices", to: "/invoice-drafts", icon: FileText, roles: ["ADMIN", "OWNER", "SALES"] },
    { section: "BILLING", label: "Invoices", desc: "Revenue tracking", to: "/invoices", icon: Receipt, roles: ["ADMIN", "OWNER", "SALES"] },
    { section: "BILLING", label: "Client Portal", desc: "Tenant access links", to: "/billing/client-portal-links", icon: Bot, roles: ["ADMIN", "OWNER"] },
    { section: "BILLING", label: "Quotes", desc: "Conversion engine", to: "/quotes", icon: ScrollText, roles: ["ADMIN", "OWNER", "SALES"] },
    
    // AI
    { section: "AI", label: "AI Control Tower", desc: "6-Claw Mesh Status", to: "/ai/control-tower", icon: Sparkles, roles: ["ADMIN", "OWNER", "OPS"] },
    { section: "AI", label: "High Risk Queue", desc: "Exception management", to: "/security/high-risk", icon: ShieldAlert, roles: ["ADMIN", "OWNER", "OPS"] },
    
    // ADMIN
    { section: "ADMIN", label: "User Roles", desc: "Permission matrix", to: "/settings/roles", icon: Users, roles: ["ADMIN", "OWNER", "COMPANY_ADMIN"] },
    { section: "ADMIN", label: "Settings", desc: "System configuration", to: "/settings", icon: Settings, roles: ["ADMIN", "OWNER", "COMPANY_ADMIN"] },

    // SUPERADMIN
    { section: "SUPERADMIN" as any, label: "Platform Overview", desc: "All tenants", to: "/superadmin", icon: Crown, roles: ["SUPER_ADMIN"] },
    { section: "SUPERADMIN" as any, label: "Manage Companies", desc: "Tenant manager", to: "/superadmin/companies", icon: Building2, roles: ["SUPER_ADMIN"] },
  ], []);

  const { user } = useAuth();
  const userRole = user?.role || "USER";

  // Debug logging
  console.log('🔍 User role:', userRole);
  console.log('🔍 User object:', user);

  const filteredNav = useMemo(() => {
    const filtered = nav.filter(item => {
      // If no roles specified, show to everyone
      if (!item.roles || item.roles.length === 0) return true;
      // Otherwise check if user has required role
      const hasAccess = item.roles.includes(userRole);
      if (item.label && item.label.includes('Fleet Map')) {
        console.log(`🔍 ${item.label}: roles=${JSON.stringify(item.roles)}, userRole=${userRole}, hasAccess=${hasAccess}`);
      }
      return hasAccess;
    });
    console.log('🔍 Filtered nav items:', filtered.map(i => i.label));
    return filtered;
  }, [nav, userRole]);

  const grouped = useMemo(() => ({
    CORE: filteredNav.filter(i => i.section === "CORE"),
    OPS: filteredNav.filter(i => i.section === "OPS"),
    INVENTORY: filteredNav.filter(i => i.section === "INVENTORY"),
    COMMUNICATIONS: filteredNav.filter(i => i.section === "COMMUNICATIONS"),
    BILLING: filteredNav.filter(i => i.section === "BILLING"),
    AI: filteredNav.filter(i => i.section === "AI"),
    ADMIN: filteredNav.filter(i => i.section === "ADMIN"),
    SUPERADMIN: filteredNav.filter(i => i.section === ("SUPERADMIN" as any)),
  }), [filteredNav]);

  const currentLabel = useMemo(() => {
    const found = [...nav].sort((a,b) => b.to.length - a.to.length).find(i => location.pathname.startsWith(i.to));
    return found?.label ?? "FlowOps";
  }, [location.pathname, nav]);

  const handleLogout = () => { 
    localStorage.removeItem("access_token");
    localStorage.removeItem("flowops_owner_token");
    navigate("/login", { replace: true }); 
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice || { outcome: 'dismissed' };
    if (outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <div className="flex h-screen bg-[#07111f] text-white overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[300px] shrink-0 border-r border-white/5 bg-[#081120] xl:flex xl:flex-col">
        <SidebarContent 
          grouped={grouped} 
          currentPath={location.pathname} 
          onNavigate={() => setMobileOpen(false)} 
          canInstall={!!installPrompt} 
          onInstall={handleInstall} 
          onLogout={handleLogout} 
        />
      </aside>

      {/* Main UI Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 border-b border-white/5 bg-[#081120]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center shrink-0">
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
        </header>

        <main role="main" aria-label="Page content" className="flex-1 overflow-y-auto bg-[#07111f] relative custom-scrollbar">
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
            />
          </aside>
        </div>
      )}
    </div>
  );
}
