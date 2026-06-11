import { Navigate, Outlet, Route, Routes } from "react-router-dom";

// CORE & PAGES
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/Shipments";
import WaybillInbox from "./pages/WaybillInbox";
import Waybills from "./pages/Waybills";
import Clients from "./pages/Clients";
import Notifications from "./pages/Notifications";
import Collections from "./pages/Collections";
import PodDeliveries from "./pages/PodDeliveries";
import DriverDispatch from "./pages/DriverDispatch";

// AUTOMATION & FINANCE
import WhatsAppHub from "./pages/automation/WhatsAppHub";
import EmailHub from "./pages/automation/EmailHub";
import ClientQueries from "./pages/communications/ClientQueries";
import RateCards from "./pages/RateCards";
import BillingBatches from "./pages/BillingBatches";
import InvoiceDraftsPage from "./pages/InvoiceDrafts";
import Invoices from "./pages/Invoices";
import ClientPortalLinks from "./pages/billing/ClientPortalLinks";
import QuotesPage from "./pages/QuotesPage";
import CreditControl from "./pages/CreditControl";

// AI & SYSTEM
import AIControlTower from "./pages/AIControlTower";
import AiWorkflow from "./pages/AiWorkflow";
import SettingsPage from "./pages/Settings";
import TenantCompanySettings from "./pages/TenantCompanySettings";
import SettingsCommandCenter from "./pages/SettingsCommandCenter";
import HighRiskQueue from "./pages/HighRiskQueue";

// LAYOUTS & AUTH
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/layout/AppLayout";
import OwnerLayout from "./components/layout/OwnerLayout";
import OwnerRoute from "./components/owner/OwnerRoute";
import SuperAdminDashboard from "./pages/owner/SuperAdminDashboard";
import OwnerTenants from "./pages/owner/OwnerTenants";
import OwnerAccessManager from "./pages/owner/OwnerAccessManager";
import TenantUsersRolesPage from "./pages/admin/TenantUsersRolesPage";

// MOBILE DRIVER PORTAL
import DriverPortal from "./pages/driver/DriverPortal";
import DriverManifest from "./pages/driver/DriverManifest";
import PublicPODView from "./pages/PublicPODView";

function ProtectedRoute() {
  const token = localStorage.getItem("access_token") || localStorage.getItem("accessToken");
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* PUBLIC */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/view/pod/:id" element={<PublicPODView />} />

      {/* DRIVER FLOW */}
      <Route path="/driver/portal" element={<DriverPortal />} />
      <Route path="/driver/manifest/:id" element={<DriverManifest />} />

      {/* SUPER ADMIN (Owner) */}
      <Route element={<OwnerRoute />}>
        <Route element={<OwnerLayout />}>
          <Route path="/owner/dashboard" element={<SuperAdminDashboard />} />
          <Route path="/owner/tenants" element={<OwnerTenants />} />
          <Route path="/owner/access" element={<OwnerAccessManager />} />
        </Route>
      </Route>

      {/* TENANT OPS */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          
          <Route path="/waybills">
            <Route index element={<Waybills />} />
            <Route path="inbox" element={<WaybillInbox />} />
          </Route>

          <Route path="/shipments" element={<Shipments />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/pod-deliveries" element={<PodDeliveries />} />
          <Route path="/driver-dispatch" element={<DriverDispatch />} />
          
          <Route path="/finance">
            <Route path="rates" element={<RateCards />} />
            <Route path="billing" element={<BillingBatches />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="credits" element={<CreditControl />} />
          </Route>

          <Route path="/ai">
            <Route path="tower" element={<AIControlTower />} />
            <Route path="workflow" element={<AiWorkflow />} />
            <Route path="risk" element={<HighRiskQueue />} />
          </Route>

          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/company" element={<TenantCompanySettings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
