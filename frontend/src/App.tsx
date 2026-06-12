import { useEffect, lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { io } from "socket.io-client";

// Eager imports (initial shell)
import AppLayout from "./components/layout/AppLayout";
import OwnerLayout from "./components/layout/OwnerLayout";
import OwnerRoute from "./components/owner/OwnerRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PageLoader from "./components/PageLoader";

// Lazy-loaded pages
const LoginPage = lazy(() => import("./pages/LoginPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Shipments = lazy(() => import("./pages/Shipments"));
const WaybillInbox = lazy(() => import("./pages/WaybillInbox"));
const Waybills = lazy(() => import("./pages/Waybills"));
const Clients = lazy(() => import("./pages/Clients"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Collections = lazy(() => import("./pages/Collections"));
const PodDeliveries = lazy(() => import("./pages/PodDeliveries"));
const DriverDispatch = lazy(() => import("./pages/DriverDispatch"));
const RateCards = lazy(() => import("./pages/RateCards"));
const BillingBatches = lazy(() => import("./pages/BillingBatches"));
const InvoiceDraftsPage = lazy(() => import("./pages/InvoiceDrafts"));
const Invoices = lazy(() => import("./pages/Invoices"));
const ClientPortalLinks = lazy(() => import("./pages/billing/ClientPortalLinks"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const AIControlTower = lazy(() => import("./pages/AIControlTower"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const BrandingSettings = lazy(() => import("./pages/settings/BrandingSettings"));
const WhatsAppHub = lazy(() => import("./pages/automation/WhatsAppHub"));
const EmailHub = lazy(() => import("./pages/automation/EmailHub"));
const ClientQueries = lazy(() => import("./pages/communications/ClientQueries"));
const SuperAdminDashboard = lazy(() => import("./pages/owner/SuperAdminDashboard"));
const OwnerTenants = lazy(() => import("./pages/owner/OwnerTenants"));
const OwnerAccessManager = lazy(() => import("./pages/owner/OwnerAccessManager"));
const DriverManifest = lazy(() => import("./pages/driver/DriverManifest"));
const TenantUsersRolesPage = lazy(() => import("./pages/admin/TenantUsersRolesPage"));
const ManifestsPage = lazy(() => import("./pages/ManifestsPage"));
const HighRiskQueuePage = lazy(() => import("./pages/HighRiskQueuePage"));
const UserRolesPage = lazy(() => import("./pages/UserRolesPage"));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const StatusPage = lazy(() => import('./pages/Status'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetup'));
const DriverPortalPage = lazy(() => import("./pages/driver/DriverPortalPage"));

// Page components now lazy-loaded from their own files




function ProtectedRoute() {
  const token = localStorage.getItem("access_token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export default function App() {
  useEffect(() => {
    const envApiUrl = import.meta.env.VITE_FLOWOPS_API_URL || "http://localhost:3005/api";
    const backendUrl = envApiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");

    const socket = io(`${backendUrl}/broadcast`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      console.log("FlowOps UI Connected to Live Guardian Bridge.");
    });

    socket.on("connect_error", (err) => {
      console.warn(`WebSocket connection failed. Is the FlowOps backend running at ${backendUrl}?`, err.message);
    });

    socket.on("system-ui-heal", (payload: { action: string; reason: string }) => {
      console.error(`SYSTEM DISCREPANCY DETECTED BY WATCHDOG: ${payload.reason}`);
      if (payload.action === "HOT_RELOAD_MODULES") {
        window.location.reload();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/legal/terms" element={<TermsPage />} />
          <Route path="/legal/privacy" element={<PrivacyPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/setup" element={<CompanySetupPage />} />

          <Route path="/driver/portal" element={<DriverPortalPage />} />
          <Route path="/driver/manifest/:id" element={<DriverManifest />} />

          <Route element={<OwnerRoute />}>
            <Route element={<OwnerLayout />}>
              <Route path="/owner" element={<Navigate to="/owner/dashboard" replace />} />
              <Route path="/owner/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/owner/tenants" element={<OwnerTenants />} />
              <Route path="/owner/access" element={<OwnerAccessManager />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/waybills/inbox" element={<WaybillInbox />} />
              <Route path="/waybills" element={<Waybills />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/pod-deliveries" element={<PodDeliveries />} />
              <Route path="/driver-dispatch" element={<DriverDispatch />} />
              <Route path="/dispatch" element={<DriverDispatch />} />
              <Route path="/manifests" element={<ManifestsPage />} />
              <Route path="/high-risk-queue" element={<HighRiskQueuePage />} />
              <Route path="/security/high-risk" element={<HighRiskQueuePage />} />
              <Route path="/user-roles" element={<UserRolesPage />} />
              <Route path="/settings/roles" element={<TenantUsersRolesPage />} />
              <Route path="/whatsapp" element={<WhatsAppHub />} />
              <Route path="/communications/whatsapp" element={<WhatsAppHub />} />
              <Route path="/email" element={<EmailHub />} />
              <Route path="/communications/email" element={<EmailHub />} />
              <Route path="/communications/client-queries" element={<ClientQueries />} />
              <Route path="/rate-cards" element={<RateCards />} />
              <Route path="/billing-batches" element={<BillingBatches />} />
              <Route path="/billing/batches" element={<BillingBatches />} />
              <Route path="/invoice-drafts" element={<InvoiceDraftsPage />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/billing/client-portal-links" element={<ClientPortalLinks />} />
              <Route path="/credit-control" element={<ClientPortalLinks />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/ai-control-tower" element={<AIControlTower />} />
              <Route path="/ai/control-tower" element={<AIControlTower />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/branding" element={<BrandingSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
