import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Package, Truck, Inbox, 
  Users, X, Menu, Search, CreditCard, Brain, Boxes, FileText 
} from "lucide-react";

type SidebarProps = { 
  isMobile?: boolean; 
  onClose?: () => void; 
  collapsed?: boolean; 
  onToggleCollapsed?: () => void; 
  counters?: any; 
  onOpenAi?: () => void; 
};

const linkBase = "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200";
const linkInactive = "text-slate-500 hover:bg-slate-50 hover:text-slate-900";
const linkActive = "bg-slate-900 text-white shadow-lg shadow-slate-200 active";

function Badge({ n, alert }: { n?: number; alert?: boolean }) {
  if (!n || n <= 0) return null;
  const c = alert ? "bg-red-500 text-white" : "bg-slate-200 text-slate-700 group-[.active]:bg-white/20";
  return <span className={`ml-auto min-w-[20px] rounded-full px-1.5 py-0.5 text-[10px] font-bold ${c}`}>{n}</span>;
}

export default function Sidebar({ isMobile, onClose, collapsed, onToggleCollapsed, counters, onOpenAi }: SidebarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const navItems = useMemo(() => [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/waybills/inbox", label: "Waybill Inbox", icon: Inbox, count: counters?.inbox, alert: true },
    { to: "/shipments", label: "Shipments", icon: Package },
    { to: "/quotes", label: "Quotes", icon: FileText }, // 🚀 ADDED QUOTES LINK
    { to: "/collections", label: "Collections", icon: Boxes }, 
    { to: "/driver-dispatch", label: "Dispatch", icon: Truck }, 
    { to: "/billing-batches", label: "Billing", icon: CreditCard }, 
    { to: "/clients", label: "Clients", icon: Users },
  ], [counters]);

  const filtered = navItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <aside className={`h-screen sticky top-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-72"}`}>
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white grid place-items-center font-black group-hover:scale-105 transition-transform">
            F
          </div>
          {!collapsed && (
            <div className="text-left">
              <div className="font-bold text-sm tracking-tight text-slate-900">FlowOps</div>
              <div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Enterprise</div>
            </div>
          )}
        </button>
        <button 
          onClick={isMobile ? onClose : onToggleCollapsed} 
          className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
        >
          {isMobile ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Quick search..."
              className="w-full bg-slate-50 border-none rounded-lg py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-slate-200 transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <nav className="p-4 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
        {filtered.map((item) => (
          <NavLink 
            key={item.to} 
            to={item.to} 
            className={({ isActive }) => `
              ${linkBase} 
              ${isActive ? linkActive : linkInactive} 
              ${collapsed ? "justify-center" : ""}
            `}
          >
            {({ isActive }) => (
              <>
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {!collapsed && <span className="font-semibold flex-1">{item.label}</span>}
                {!collapsed && <Badge n={item.count} alert={item.alert} />}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}

        <button 
          onClick={onOpenAi}
          className={`w-full mt-6 group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all duration-200 bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 ${collapsed ? "justify-center" : ""}`}
        >
          <Brain size={18} strokeWidth={2.5} className={collapsed ? "" : "animate-pulse"} />
          {!collapsed && <span className="font-bold flex-1 text-left">AI Query (The Claw)</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-indigo-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              Open AI Claw
            </div>
          )}
        </button>
      </nav>
    </aside>
  );
}
