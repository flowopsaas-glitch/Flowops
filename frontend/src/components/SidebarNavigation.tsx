import { Mail, Package2 } from 'lucide-react';
// src/components/SidebarNavigation.tsx
import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Truck,
  Route,
  FileText,
  Receipt,
  Users,
  X,
  LogOut,
  Settings,
  MapIcon,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Types for navigation
interface NavItem {
  name: string;
  page: string;
  icon: React.ComponentType<any>;
  roles?: string[];
  subscription?: string[];
  badge?: number;
}

// Sidebar items
export const navigation: NavItem[] = [
  { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { name: "Analytics", page: "Analytics", icon: BarChart3 },
  { name: "AI Workflow", page: "AIWorkflow", icon: Sparkles, roles: ["OWNER", "ADMIN", "OPS", "SALES"], subscription: ["Ultimate", "Pro"] },
  { name: "ðŸ“¦ Book Shipment", page: "CustomerPortal", icon: Package, roles: ["USER", "SALES", "ADMIN"] },
  { name: "ðŸ” Track Shipment", page: "TrackShipment", icon: MapIcon },
  { name: "Driver App", page: "DriverApp", icon: Truck, roles: ["OPS", "ADMIN", "DISPATCHER"] },
  { name: "WhatsApp Hub", page: "WhatsAppHub", icon: MessageCircle, roles: ["ADMIN", "OWNER"] },
  { name: "Production", page: "ProductionProcesses", icon: Settings, roles: ["OPS", "ADMIN"] },
  { name: "Capacity Planning", page: "CapacityPlanning", icon: Sparkles, roles: ["ADMIN", "OWNER"] },
  { name: "MRP System", page: "MRPSystem", icon: Package, roles: ["ADMIN", "OWNER"], subscription: ["Ultimate"] },
  { name: "Location Analysis", page: "LocationAnalysis", icon: MapIcon, roles: ["ADMIN", "OWNER"] },
  { name: "Carriers", page: "CarrierManagement", icon: Truck },
  { name: "Waybills", page: "Waybills", icon: FileText },
  { name: "Clients", page: "Clients", icon: Users, roles: ["SALES", "ADMIN"] },
  { name: "Live Tracking", page: "LiveTracking", icon: MapIcon, roles: ["OPS", "ADMIN"] },
  { name: "Route Optimizer", page: "RouteOptimizer", icon: Sparkles, roles: ["OPS", "ADMIN"] },
  { name: "Stock", page: "Stock", icon: Package, roles: ["OPS", "ADMIN"] },
  { name: "Drivers", page: "Drivers", icon: Users, roles: ["OPS", "ADMIN", "DISPATCHER"] },
  { name: "Routes", page: "Routes", icon: Route, roles: ["OPS", "ADMIN"] },
  { name: "Driver Requests", page: "DriverRequests", icon: Truck, roles: ["OPS", "ADMIN"] },

  { name: "🗺️ Live Fleet Map", page: "FleetMap", icon: MapIcon, roles: ["OPS", "ADMIN", "DISPATCHER"], permission: "fleetMap" },
  { name: "📊 Driver Analytics", page: "DriverAnalytics", icon: TrendingUp, roles: ["OPS", "ADMIN", "DISPATCHER"], permission: "driverAnalytics" },
  { name: "💬 Dispatch Chat", page: "DispatchChat", icon: MessageSquare, roles: ["OPS", "ADMIN", "DISPATCHER"], permission: "dispatchChat" },

  { name: "Deliveries", page: "Deliveries", icon: Truck, roles: ["OPS", "ADMIN", "DISPATCHER"] },
  { name: "Quotes", page: "Quotes", icon: FileText, roles: ["SALES", "ADMIN"] },
  { name: "Invoices", page: "Invoices", icon: Receipt, roles: ["SALES", "ADMIN"] },
];

// Sidebar component
export const SidebarNavigation = ({ role, subscription }: { role: string; subscription: string }) => {
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Fetch real-time data from Prisma (example API)
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/ai-workflow/summary"); // backend endpoint returning counts
        const data = await res.json();
        setBadges(data); // e.g., { PendingCollections: 12, DriverRequests: 5, LowStock: 3 }
      } catch (err) {
        console.error("Failed to fetch AI workflow data", err);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-64 h-full bg-gray-900 text-white flex flex-col shadow-lg">
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        <h2 className="font-bold text-xl">FlowOps Portal</h2>
        <Button variant="ghost" size="sm">
          <X />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {navigation.map((item) => {
          if (item.roles && !item.roles.includes(role)) return null;
          if (item.subscription && !item.subscription.includes(subscription)) return null;

          return (
            <Button
              key={item.page}
              variant="ghost"
              className="w-full justify-between items-center"
              onClick={() => console.log("Navigate to:", item.page)}
            >
              <div className="flex items-center space-x-2">
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
              {badges[item.name] && badges[item.name] > 0 && (
                <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{badges[item.name]}</span>
              )}
            </Button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-2">
        <Button variant="ghost" className="w-full justify-start space-x-2">
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </Button>
        {role === "OWNER" && (
          <Button variant="ghost" className="w-full justify-start space-x-2">
            <Settings className="w-5 h-5" />
            <span>System Settings</span>
          </Button>
        )}
      </div>
    </div>
  );
};

