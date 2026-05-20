import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    FaStream, FaLink, FaCog, FaUsers, FaTag, FaEnvelope, FaWhatsapp, FaBoxOpen, 
    FaFileInvoiceDollar, FaCloud, FaUserShield, FaBox, FaMapMarkerAlt, 
    FaTruck, FaMicrochip, FaMagic, FaFileAlt, FaReceipt, FaRoute,
    FaSignOutAlt, FaShieldAlt, FaCheckCircle
} from "react-icons/fa";
import { Link, useLocation as useRouterLocation } from 'react-router-dom'
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarProvider,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button';

const menuItems = [
    { icon: FaStream, label: 'Dashboard', path: '/workflows', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaBox, label: 'Book Shipment', path: '/customer-portal', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMapMarkerAlt, label: 'Track Shipment', path: '/track-shipment', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaTruck, label: 'Driver App', path: '/driver-app', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaBoxOpen, label: 'Collections', path: '/collections', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
{ icon: FaWhatsapp, label: 'WhatsApp Hub', path: '/whatsapp', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'], plan: ['Enterprise'] },
{ icon: FaEnvelope, label: 'Email', path: '/email', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMicrochip, label: 'Production', path: '/production', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMagic, label: 'Capacity Planning', path: '/capacity-planning', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaBox, label: 'MRP System', path: '/mrp-system', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMapMarkerAlt, label: 'Location Analysis', path: '/location-analysis', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaTruck, label: 'Carriers', path: '/carriers', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaFileAlt, label: 'Waybills', path: '/waybills', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaUsers, label: 'Clients', path: '/clients', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMapMarkerAlt, label: 'Live Tracking', path: '/live-tracking', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaMagic, label: 'Route Optimizer', path: '/route-optimizer', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaBox, label: 'Stock', path: '/stock', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaUsers, label: 'Drivers', path: '/drivers', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaRoute, label: 'Routes', path: '/routes', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaTruck, label: 'Driver Requests', path: '/driver-requests', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaTruck, label: 'Deliveries', path: '/deliveries', roles: ['ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaFileAlt, label: 'Quotes', path: '/quotes', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaReceipt, label: 'Invoices', path: '/invoices', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'] },
    { icon: FaFileInvoiceDollar, label: 'CostTracker PO', path: '/cost-tracker', roles: ['ADMIN', 'ULTIMATE_OWNER'], plan: ['Pro', 'Enterprise'] },
    { icon: FaEnvelope, label: 'Outlook Mail', path: '/outlook', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'], plan: ['Pro', 'Enterprise'] },
    { icon: FaCloud, label: 'Cloud PODs', path: '/cloud-storage', roles: ['USER', 'ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ULTIMATE_OWNER'], plan: ['Pro', 'Enterprise'] },
    { icon: FaUserShield, label: 'AI Supervisor', path: '/supervisor', roles: ['ULTIMATE_OWNER'] },
    { icon: FaShieldAlt, label: 'Admin Approvals', path: '/admin/approvals', roles: ['ULTIMATE_OWNER'] },
    { icon: FaCog, label: 'Settings', path: '/admin/tenant-settings', roles: ['ADMIN', 'COMPANY_ADMIN', 'ULTIMATE_OWNER'] },
];

export default function DashboardSidebar() {
    const location = useRouterLocation();
    const navigate = useNavigate();
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : { role: 'ADMIN', plan: 'Starter', name: 'User' };

    const isUltimateOwner = user.isUltimateOwner || user.role === 'ULTIMATE_OWNER';
    const isApproved = user.approvalStatus === 'APPROVED' || isUltimateOwner;

    // Filter menu items based on user role and approval status
    const filteredItems = menuItems.filter(item => {
        // Ultimate Owner sees everything
        if (isUltimateOwner) return true;
        
        // Non-approved users only see dashboard
        if (!isApproved) return item.path === '/workflows';
        
        const roleMatch = item.roles.includes(user.role);
        const planMatch = !item.plan || item.plan.includes(user.plan);
        return roleMatch && planMatch;
    });

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await fetch('http://localhost:3000/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }).catch(err => console.error('Logout notification failed:', err));
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('session');
            localStorage.removeItem('isLoggedIn');
            navigate('/login', { replace: true });
        }
    };

    return (
        <SidebarProvider defaultOpen={true}>
            <Sidebar className="border-r bg-background">
                <SidebarHeader>
                    <h2 className="px-6 py-4 border-b">
                        <span className="text-primary flex items-center text-lg font-medium">
                            FlowOps
                        </span>
                    </h2>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupContent className="p-2">
                            <SidebarMenu>
                                {filteredItems.map((item) => (
                                    <SidebarMenuItem key={item.path}>
                                        <SidebarMenuButton asChild>
                                            <Link 
                                                to={item.path} 
                                                className={cn(
                                                    "flex items-center px-3 py-2 text-sm rounded-md transition-colors",
                                                    location.pathname === item.path 
                                                        ? "bg-accent text-accent-foreground" 
                                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                )}
                                            >
                                                <item.icon className="mr-3 h-4 w-4" />
                                                <span>{item.label}</span>
                                                {item.path === '/admin/approvals' && isUltimateOwner && (
                                                    <FaShieldAlt className="ml-auto h-3 w-3 text-yellow-500" />
                                                )}
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
                <div className="p-4 border-t mt-auto space-y-3">
                    <div className="flex items-center gap-3 px-2">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                            {user.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex flex-col overflow-hidden flex-1">
                            <span className="text-sm font-medium truncate">{user.name || 'User'}</span>
                            <span className="text-xs text-muted-foreground truncate">{user.plan || 'Starter'} Plan</span>
                        </div>
                    </div>
                    
                    {/* User Status Badges */}
                    <div className="flex gap-2 flex-wrap px-2">
                        {isUltimateOwner && (
                            <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-semibold flex items-center gap-1">
                                <FaShieldAlt className="h-3 w-3" />
                                Ultimate Owner
                            </div>
                        )}
                        {isApproved && !isUltimateOwner && (
                            <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold flex items-center gap-1">
                                <FaCheckCircle className="h-3 w-3" />
                                Approved
                            </div>
                        )}
                        {!isApproved && !isUltimateOwner && (
                            <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-semibold">
                                Pending Approval
                            </div>
                        )}
                    </div>

                    {/* Logout Button */}
                    <Button
                        onClick={handleLogout}
                        variant="outline"
                        size="sm"
                        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                        <FaSignOutAlt className="mr-2 h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </Sidebar>
        </SidebarProvider>
    )
}



