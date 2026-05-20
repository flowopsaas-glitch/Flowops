"use client";

import {
  LayoutDashboard,
  Package,
  Truck,
  MapIcon,
  Users,
  FileText,
  Receipt,
  Settings,
  Sparkles,
  MessageCircle
} from "lucide-react";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Example subscription structure from API or context
interface UserSubscription {
  modules: string[]; // allowed pages
  role: "OWNER" | "ADMIN" | "USER" | "OPS" | "SALES" | "DISPATCH";
}

interface NavigationItem {
  name: string;
  page: string;
  icon: any;
}

const ALL_NAVIGATION: NavigationItem[] = [
  { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { name: "📦 Book Shipment", page: "CustomerPortal", icon: Package },
  { name: "🔍 Track Shipment", page: "TrackShipment", icon: MapIcon },
  { name: "Driver App", page: "DriverApp", icon: Truck },
  { name: "WhatsApp Hub", page: "WhatsAppHub", icon: MessageCircle },
  { name: "Production", page: "ProductionProcesses", icon: Settings },
  { name: "Capacity Planning", page: "CapacityPlanning", icon: Sparkles },
  { name: "MRP System", page: "MRPSystem", icon: Package },
  { name: "Location Analysis", page: "LocationAnalysis", icon: MapIcon },
  { name: "Carriers", page: "CarrierManagement", icon: Truck },
  { name: "Waybills", page: "Waybills", icon: FileText },
  { name: "Clients", page: "Clients", icon: Users },
  { name: "Live Tracking", page: "LiveTracking", icon: MapIcon },
  { name: "Route Optimizer", page: "RouteOptimizer", icon: Sparkles },
  { name: "Stock", page: "Stock", icon: Package },
  { name: "Drivers", page: "Drivers", icon: Users },
  { name: "Routes", page: "Routes", icon: Truck },
  { name: "Driver Requests", page: "DriverRequests", icon: Truck },
  { name: "Deliveries", page: "Deliveries", icon: Truck },
  { name: "Quotes", page: "Quotes", icon: FileText },
  { name: "Invoices", page: "Invoices", icon: Receipt },
];

export default function CustomerSidebar() {
  const [subscription, setSubscription] = useState<UserSubscription>({
    modules: [],
    role: "USER",
  });

  // Simulate fetching subscription from API
  useEffect(() => {
    async function fetchSubscription() {
      // Replace this fetch with real API
      const res = await fetch("/api/user/subscription");
      const data = await res.json();
      setSubscription(data);
    }

    fetchSubscription();
  }, []);

  // Filter navigation by subscription
  const visibleNavigation = subscription.role === "OWNER"
    ? ALL_NAVIGATION
    : ALL_NAVIGATION.filter((nav) => subscription.modules.includes(nav.page));

  return (
    <aside className="w-64 bg-gradient-to-b from-indigo-900 via-purple-800 to-indigo-700 text-white min-h-screen p-4 space-y-6">
      {/* Logo */}
      <div className="flex items-center space-x-2 mb-8">
        <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-full" />
        <span className="text-2xl font-bold">FlowOps AI</span>
      </div>

      {/* Navigation */}
      <nav className="space-y-2">
        {visibleNavigation.map((item) => (
          <Button
            key={item.page}
            variant="ghost"
            className={cn("w-full justify-start text-white")}
          >
            <item.icon className="mr-2 h-5 w-5" />
            {item.name}
          </Button>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto text-sm opacity-80">
        <p>Role: {subscription.role}</p>
      </div>
    </aside>
  );
}
