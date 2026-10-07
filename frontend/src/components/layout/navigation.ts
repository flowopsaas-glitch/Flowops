import {
  LayoutDashboard,
  Truck,
  Route,
  FileText,
  Receipt,
  Users,
  Sparkles,
  Map as MapIcon,
} from "lucide-react";

// Navigation entries whose destination has an active route in App.tsx.
// Entries for retired/legacy destinations (customer-portal, track-shipment,
// driver-app, whatsapp-hub, production-processes, capacity-planning,
// mrp-system, location-analysis, stock, driver-requests, deliveries) were
// removed in the 2026-10-07 release-readiness audit: those pages have no
// active route, so the links led nowhere. See
// docs/RELEASE-READINESS-AUDIT-2026-10-07.md.
export const navigation = [
  { name: "Dashboard", page: "dashboard", icon: LayoutDashboard },
  { name: "Carriers", page: "carriers", icon: Truck },
  { name: "Waybills", page: "waybills", icon: FileText },
  { name: "Clients", page: "clients", icon: Users },
  { name: "Live Tracking", page: "live-tracking", icon: MapIcon },
  { name: "Route Optimizer", page: "route-optimizer", icon: Sparkles },
  { name: "Drivers", page: "drivers", icon: Users },
  { name: "Routes", page: "routes", icon: Route },
  { name: "Quotes", page: "quotes", icon: FileText },
  { name: "Invoices", page: "invoices", icon: Receipt },
];
