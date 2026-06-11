import { Inbox, Package, CreditCard, Users, BarChart3, Settings } from "lucide-react"; // 🚀 Change 'Shipments' to 'Package'

export const navItems = [
  { label: 'Waybill Inbox', path: '/waybills/inbox', icon: Inbox, badge: 'NEW' },
  { label: 'Shipments', path: '/shipments', icon: Package }, // 🚀 Using Package icon
  { label: 'Billing Batches', path: '/billing/batches', icon: CreditCard },
  { label: 'Drivers Dispatch', path: '/drivers/dispatch', icon: Users },
  { label: 'Analytics', path: '/dashboard', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
];