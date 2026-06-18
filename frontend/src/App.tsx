import { useEffect, lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { io } from "socket.io-client";
import { FLOWOPS_WS_ORIGIN } from "./lib/env";

// Eager imports (initial shell)
import AppLayout from "./components/layout/AppLayout";
import OwnerLayout from "./components/layout/OwnerLayout";
import OwnerRoute from "./components/owner/OwnerRoute";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RequirePermission from "./components/auth/RequirePermission";
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
const CODReconciliation = lazy(() => import("./pages/billing/CODReconciliation"));
const DriverWalletPage  = lazy(() => import("./pages/billing/DriverWalletPage"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const AIControlTower = lazy(() => import("./pages/AIControlTower"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const BrandingSettings = lazy(() => import("./pages/settings/BrandingSettings"));
const NotificationPreferences = lazy(
  () => import("./pages/settings/NotificationPreferences"),
);
const Integrations = lazy(() => import("./pages/settings/Integrations"));
const WhatsAppHub = lazy(() => import("./pages/automation/WhatsAppHub"));
const EmailHub = lazy(() => import("./pages/automation/EmailHub"));
const ClientQueries = lazy(() => import("./pages/communications/ClientQueries"));
const SuperAdminDashboard = lazy(() => import("./pages/owner/SuperAdminDashboard"));
const OwnerTenants = lazy(() => import("./pages/owner/OwnerTenants"));
const OwnerAccessManager = lazy(() => import("./pages/owner/OwnerAccessManager"));
const OwnerAudit = lazy(() => import("./pages/owner/OwnerAudit"));
const OwnerTenantDetail = lazy(() => import("./pages/owner/OwnerTenantDetail"));
const OwnerOpsMap = lazy(() => import("./pages/owner/OwnerOpsMap"));
const WaybillCapture = lazy(() => import("./pages/WaybillCapture"));
const DriverManifest = lazy(() => import("./pages/driver/DriverManifest"));
const TenantUsersRolesPage = lazy(() => import("./pages/admin/TenantUsersRolesPage"));
const TenantAdminHome = lazy(() => import("./pages/admin/TenantAdminHome"));
const ManifestsPage = lazy(() => import("./pages/ManifestsPage"));
const RouteOptimizer = lazy(() => import("./pages/RouteOptimizer"));
const HighRiskQueuePage = lazy(() => import("./pages/HighRiskQueuePage"));
const UserRolesPage = lazy(() => import("./pages/UserRolesPage"));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const StatusPage = lazy(() => import('./pages/Status'));
const TrackingPage = lazy(() => import('./pages/TrackingPage'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetup'));
const DriverPortalPage = lazy(() => import("./pages/driver/DriverPortalPage"));
const SignupPage = lazy(() => import("./pages/Signup"));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));

export default function App() {
  useEffect(() => {
    const socket = io(`${FLOWOPS_WS_ORIGIN}/broadcast`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      // Connected — no console output needed in production.
    });

    socket.on("connect_error", (err) => {
      if (import.meta.env.DEV) {
        console.warn(`WebSocket connection failed. Is the FlowOps backend running at ${FLOWOPS_WS_ORIGIN}?`, err.message);
      }
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
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/legal/terms" element={<TermsPage />} />
          <Route path="/legal/privacy" element={<PrivacyPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/track" element={<TrackingPage />} />
          <Route path="/track/:trackingNumber" element={<TrackingPage />} />
          <Route path="/setup" element={<CompanySetupPage />} />

          <Route path="/driver/portal" element={<DriverPortalPage />} />
          <Route path="/driver/manifest/:id" element={<DriverManifest />} />

          <Route element={<OwnerRoute />}>
            <Route element={<OwnerLayout />}>
              <Route path="/owner" element={<Navigate to="/owner/dashboard" replace />} />
              <Route path="/owner/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/owner/tenants" element={<OwnerTenants />} />
              <Route path="/owner/tenants/:id" element={<OwnerTenantDetail />} />
              <Route path="/owner/access" element={<OwnerAccessManager />} />
              <Route path="/owner/ops" element={<OwnerOpsMap />} />
              <Route path="/owner/audit" element={<OwnerAudit />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<RequirePermission adminOnly><TenantAdminHome /></RequirePermission>} />
              <Route path="/shipments" element={<RequirePermission perm="shipments"><Shipments /></RequirePermission>} />
              <Route path="/waybills/inbox" element={<RequirePermission perm="waybillInbox"><WaybillInbox /></RequirePermission>} />
              <Route path="/waybills/scan" element={<RequirePermission perm="waybillInbox"><WaybillCapture /></RequirePermission>} />
              <Route path="/waybills" element={<RequirePermission perm="waybills"><Waybills /></RequirePermission>} />
              <Route path="/clients" element={<RequirePermission perm="clients"><Clients /></RequirePermission>} />
              <Route path="/notifications" element={<RequirePermission perm="notifications"><Notifications /></RequirePermission>} />
              <Route path="/collections" element={<RequirePermission perm="collections"><Collections /></RequirePermission>} />
              <Route path="/pod-deliveries" element={<RequirePermission perm="podDeliveries"><PodDeliveries /></RequirePermission>} />
              <Route path="/driver-dispatch" element={<RequirePermission perm="driverDispatch"><DriverDispatch /></RequirePermission>} />
              <Route path="/dispatch" element={<RequirePermission perm="driverDispatch"><DriverDispatch /></RequirePermission>} />
              <Route path="/manifests" element={<ManifestsPage />} />
              <Route path="/routes" element={<RequirePermission perm="driverDispatch"><RouteOptimizer /></RequirePermission>} />
              <Route path="/route-optimizer" element={<RequirePermission perm="driverDispatch"><RouteOptimizer /></RequirePermission>} />
              <Route path="/high-risk-queue" element={<RequirePermission perm="risksExceptions"><HighRiskQueuePage /></RequirePermission>} />
              <Route path="/security/high-risk" element={<RequirePermission perm="risksExceptions"><HighRiskQueuePage /></RequirePermission>} />
              <Route path="/user-roles" element={<RequirePermission perm="usersRoles"><UserRolesPage /></RequirePermission>} />
              <Route path="/settings/roles" element={<RequirePermission perm="usersRoles"><TenantUsersRolesPage /></RequirePermission>} />
              <Route path="/whatsapp" element={<RequirePermission perm="whatsapp"><WhatsAppHub /></RequirePermission>} />
              <Route path="/communications/whatsapp" element={<RequirePermission perm="whatsapp"><WhatsAppHub /></RequirePermission>} />
              <Route path="/email" element={<RequirePermission perm="email"><EmailHub /></RequirePermission>} />
              <Route path="/communications/email" element={<RequirePermission perm="email"><EmailHub /></RequirePermission>} />
              <Route path="/communications/client-queries" element={<RequirePermission perm="clientQueries"><ClientQueries /></RequirePermission>} />
              <Route path="/rate-cards" element={<RequirePermission perm="rateCards"><RateCards /></RequirePermission>} />
              <Route path="/billing-batches" element={<RequirePermission perm="billingBatches"><BillingBatches /></RequirePermission>} />
              <Route path="/billing/batches" element={<RequirePermission perm="billingBatches"><BillingBatches /></RequirePermission>} />
              <Route path="/invoice-drafts" element={<RequirePermission perm="invoiceDrafts"><InvoiceDraftsPage /></RequirePermission>} />
              <Route path="/invoices" element={<RequirePermission perm="invoices"><Invoices /></RequirePermission>} />
              <Route path="/billing/client-portal-links" element={<RequirePermission perm="creditControl"><ClientPortalLinks /></RequirePermission>} />
              <Route path="/credit-control" element={<RequirePermission perm="creditControl"><ClientPortalLinks /></RequirePermission>} />
              <Route path="/cod" element={<RequirePermission perm="billingBatches"><CODReconciliation /></RequirePermission>} />
              <Route path="/cod/wallets/:driverId" element={<RequirePermission perm="billingBatches"><DriverWalletPage /></RequirePermission>} />
              <Route path="/quotes" element={<RequirePermission perm="quotes"><QuotesPage /></RequirePermission>} />
              <Route path="/ai-control-tower" element={<RequirePermission perm="aiControlTower"><AIControlTower /></RequirePermission>} />
              <Route path="/ai/control-tower" element={<RequirePermission perm="aiControlTower"><AIControlTower /></RequirePermission>} />
              <Route path="/settings" element={<RequirePermission perm="settings"><SettingsPage /></RequirePermission>} />
              <Route path="/settings/branding" element={<RequirePermission perm="settings"><BrandingSettings /></RequirePermission>} />
              <Route
                path="/settings/notifications"
                element={<RequirePermission perm="settings"><NotificationPreferences /></RequirePermission>}
              />
              <Route
                path="/settings/integrations"
                element={<RequirePermission perm="settings"><Integrations /></RequirePermission>}
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
