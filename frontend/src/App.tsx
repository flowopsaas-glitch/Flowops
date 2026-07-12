import { useEffect, lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { io } from "socket.io-client";
import { getToken } from "./api/client";
import { FLOWOPS_WS_ORIGIN } from "./lib/env";

// Eager imports (initial shell)
import AppLayout from "./components/layout/AppLayout";
import OwnerLayout from "./components/layout/OwnerLayout";
import OwnerRoute from "./components/owner/OwnerRoute";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RequirePermission from "./components/auth/RequirePermission";
import RequireFeature from "./components/auth/RequireFeature";
import RootRoute from "./components/auth/RootRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PageLoader from "./components/PageLoader";

// Lazy-loaded pages
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SsoFinish = lazy(() => import("./pages/SsoFinish"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Shipments = lazy(() => import("./pages/Shipments"));
const WaybillInbox = lazy(() => import("./pages/WaybillInbox"));
const Waybills = lazy(() => import("./pages/Waybills"));
const AskFlowOps = lazy(() => import("./pages/AskFlowOps"));
const Returns = lazy(() => import("./pages/Returns"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Disbursements = lazy(() => import("./pages/Disbursements"));
const Clients = lazy(() => import("./pages/Clients"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Collections = lazy(() => import("./pages/Collections"));
const OperationsDashboard = lazy(() => import("./pages/operations/OperationsDashboard"));
const PodDeliveries = lazy(() => import("./pages/PodDeliveries"));
const DriverDispatch = lazy(() => import("./pages/DriverDispatch"));
const RateCards = lazy(() => import("./pages/RateCards"));
const BillingBatches = lazy(() => import("./pages/BillingBatches"));
const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const InvoiceDraftsPage = lazy(() => import("./pages/InvoiceDrafts"));
const Invoices = lazy(() => import("./pages/Invoices"));
// Stub page — renders "coming soon" until the booking-portal backend ships.
const ClientPortalLinks = lazy(() => import("./pages/billing/ClientPortalLinks"));
const CreditControl     = lazy(() => import("./pages/CreditControl"));
const CODReconciliation = lazy(() => import("./pages/billing/CODReconciliation"));
const DriverWalletPage  = lazy(() => import("./pages/billing/DriverWalletPage"));
const RateShopping      = lazy(() => import("./pages/billing/RateShopping"));
const FieldDeliveryPage = lazy(() => import("./pages/FieldDeliveryPage"));
const DriverChatPage    = lazy(() => import("./pages/DriverChatPage"));
const CustomerServiceHub = lazy(() => import("./pages/CustomerServiceHub"));
const WarehouseHubPage  = lazy(() => import("./pages/WarehouseHubPage"));
const BillingPlans      = lazy(() => import("./pages/billing/BillingPlans"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const AIControlTower = lazy(() => import("./pages/AIControlTower"));
const CompetitiveIntelligence = lazy(() => import("./pages/CompetitiveIntelligence"));
const Observatory = lazy(() => import("./pages/Observatory"));
const ForwardingConsole = lazy(() => import("./pages/forwarding/ForwardingConsole"));
const ShipmentFilePage = lazy(() => import("./pages/forwarding/ShipmentFile"));
const AutopilotConsole = lazy(() => import("./pages/enterprise/AutopilotConsole"));
const SupportAgent = lazy(() => import("./pages/SupportAgent"));
const CourierManagement = lazy(() => import("./pages/CourierManagement"));
const LogisticsAnalytics = lazy(() => import("./pages/LogisticsAnalytics"));
const CommercialAnalytics = lazy(() => import("./pages/CommercialAnalytics"));
const WarehouseManagement = lazy(() => import("./pages/WarehouseManagement"));
const CarrierManagement = lazy(() => import("./pages/CarrierManagement"));
const SsoSettings = lazy(() => import("./pages/enterprise/SsoSettings"));
const DepotsPage        = lazy(() => import("./pages/DepotsPage"));
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
const BatchScan      = lazy(() => import("./pages/BatchScan"));
const BulkImport     = lazy(() => import("./pages/BulkImport"));
const DriverManifest = lazy(() => import("./pages/driver/DriverManifest"));
const TenantUsersRolesPage = lazy(() => import("./pages/admin/TenantUsersRolesPage"));
const TenantAdminHome = lazy(() => import("./pages/admin/TenantAdminHome"));
const ManifestsPage = lazy(() => import("./pages/ManifestsPage"));
const LoadScan = lazy(() => import("./pages/LoadScan"));
const RouteOptimizer = lazy(() => import("./pages/RouteOptimizer"));
const FleetMaintenance = lazy(() => import("./pages/FleetMaintenance"));
const DriverLeaderboard = lazy(() => import("./pages/DriverLeaderboard"));
const HighRiskQueuePage = lazy(() => import("./pages/HighRiskQueuePage"));
const UserRolesPage = lazy(() => import("./pages/UsersRoles"));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const StatusPage = lazy(() => import('./pages/Status'));
const TrackingPage = lazy(() => import('./pages/TrackingPage'));
const CustomerPortal = lazy(() => import("./pages/CustomerPortal"));
const CompanySetupPage = lazy(() => import('./pages/CompanySetup'));
const OnboardingWizard = lazy(() => import("./pages/OnboardingWizard"));
const EsgDashboard = lazy(() => import("./pages/EsgDashboard"));
const DriverPortalPage = lazy(() => import("./pages/driver/DriverPortalPage"));
const DriverHomePage   = lazy(() => import("./pages/driver/DriverHomePage"));
const SignupPage = lazy(() => import("./pages/Signup"));
const SignupMobilePage = lazy(() => import("./pages/SignupMobile"));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const RatingPage   = lazy(() => import("./pages/RatingPage"));
// Marketing pages
const LandingPage   = lazy(() => import("./pages/marketing/LandingPage"));
const FeaturesPage  = lazy(() => import("./pages/marketing/FeaturesPage"));
const PricingPage   = lazy(() => import("./pages/marketing/PricingPage"));
const SubcontractorPage = lazy(() => import("./pages/marketing/SubcontractorPage"));
const NotFoundPage  = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  useEffect(() => {
    // Backend EventsGateway runs on the default namespace (/).
    // Use a *function* for auth so every reconnect attempt reads the
    // current token from storage — this lets the socket auto-recover after
    // the user logs in without any explicit re-setup.
    const socket = io(FLOWOPS_WS_ORIGIN, {
      // Polling-first, then upgrade to WebSocket when the proxy allows it —
      // avoids a hard failure (and console 502) when the WS upgrade is blocked.
      transports: ["polling", "websocket"],
      auth: (cb: (data: Record<string, string>) => void) => {
        cb({ token: getToken?.() ?? '' });
      },
      autoConnect: true,
      // Keep retrying indefinitely — the gateway will accept once the user
      // has a valid tenant JWT (after login).  Without Infinity the socket
      // gives up before the user even reaches the dashboard.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
    });

    socket.on("connect", () => {
      // Connected successfully — no console noise in production.
    });

    socket.on("connect_error", (err) => {
      // "Invalid namespace" fires during NestJS hot-reload restarts (the /
      // namespace briefly disappears then reappears).  "xhr poll error" fires
      // when the backend is temporarily down.  Both are expected in dev and
      // produce no actionable output, so we filter them out.
      const silent = ['Invalid namespace', 'xhr poll error', 'timeout'];
      if (import.meta.env.DEV && getToken?.() && !silent.includes(err.message)) {
        console.warn(
          `WebSocket connection failed. Is the FlowOps backend running at ${FLOWOPS_WS_ORIGIN}?`,
          err.message,
        );
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
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupMobilePage />} />
          <Route path="/signup/classic" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/legal/terms" element={<TermsPage />} />
          <Route path="/legal/privacy" element={<PrivacyPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/track" element={<TrackingPage />} />
          <Route path="/track/:trackingNumber" element={<TrackingPage />} />
          <Route path="/portal/:companyId" element={<CustomerPortal />} />
          <Route path="/rate/:token" element={<RatingPage />} />
          <Route path="/sso/finish" element={<SsoFinish />} />
          <Route path="/setup" element={<CompanySetupPage />} />
          {/* Marketing pages — public, no auth required */}
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/last-mile" element={<SubcontractorPage />} />
          <Route path="/subcontractors" element={<SubcontractorPage />} />
          <Route path="/transport-operators" element={<SubcontractorPage />} />
          {/* Marketing root — shown to visitors going to /home explicitly */}
          <Route path="/home" element={<LandingPage />} />
          <Route
            path="/driver/portal"
            element={
              <div className="min-h-screen bg-[#07111f] flex items-center justify-center p-8">
                <div className="max-w-sm w-full rounded-[28px] border border-white/10 bg-white/[0.05] p-8 text-center">
                  <div className="text-5xl mb-4">🚚</div>
                  <h2 className="text-xl font-black text-white mb-2">Driver App</h2>
                  <p className="text-sm text-white/50 mb-6">
                    The driver app has moved to its own dedicated portal — installable as a PWA, works offline, and supports phone + PIN login.
                  </p>
                  <a
                    href="https://driver.flowop.work"
                    className="block w-full rounded-2xl bg-blue-600 py-4 text-sm font-black text-white hover:bg-blue-500 transition"
                  >
                    Open Driver Portal →
                  </a>
                  <p className="mt-4 text-[11px] text-white/25">driver.flowop.work</p>
                </div>
              </div>
            }
          />
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
              <Route path="/owner/intel" element={<CompetitiveIntelligence />} />
              <Route path="/owner/observatory" element={<Observatory />} />
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
              <Route path="/waybills/batch-scan" element={<RequirePermission perm="waybillInbox"><BatchScan /></RequirePermission>} />
              <Route path="/waybills/bulk-import" element={<RequirePermission perm="waybillInbox"><BulkImport /></RequirePermission>} />
              <Route path="/waybills" element={<RequirePermission perm="waybills"><Waybills /></RequirePermission>} />
              <Route path="/clients" element={<RequirePermission perm="clients"><Clients /></RequirePermission>} />
              <Route path="/notifications" element={<RequirePermission perm="notifications"><Notifications /></RequirePermission>} />
              <Route path="/collections" element={<RequirePermission perm="collections"><Collections /></RequirePermission>} />
              <Route path="/returns" element={<RequirePermission perm="returns"><RequireFeature feature="returns" name="Returns / RMA"><Returns /></RequireFeature></RequirePermission>} />
              <Route path="/operations" element={<RequirePermission perm="driverDispatch"><OperationsDashboard /></RequirePermission>} />
              <Route path="/warehouse"  element={<RequirePermission perm="waybillInbox"><WarehouseHubPage /></RequirePermission>} />
              <Route path="/driver-chat" element={<RequirePermission perm="driverDispatch"><DriverChatPage /></RequirePermission>} />
              <Route path="/customer-service" element={<RequirePermission perm="quotes"><CustomerServiceHub /></RequirePermission>} />
              <Route path="/field-delivery"   element={<RequirePermission perm="podDeliveries"><FieldDeliveryPage /></RequirePermission>} />
              <Route path="/pod-deliveries" element={<RequirePermission perm="podDeliveries"><PodDeliveries /></RequirePermission>} />
              <Route path="/driver-home"   element={<RequirePermission perm="podDeliveries"><DriverHomePage /></RequirePermission>} />
              <Route path="/driver-dispatch" element={<RequirePermission perm="driverDispatch"><DriverDispatch /></RequirePermission>} />
              <Route path="/dispatch" element={<RequirePermission perm="driverDispatch"><DriverDispatch /></RequirePermission>} />
              <Route path="/manifests" element={<RequirePermission perm="waybillInbox"><ManifestsPage /></RequirePermission>} />
              <Route path="/manifests/:id/load-scan" element={<RequirePermission perm="waybillInbox"><LoadScan /></RequirePermission>} />
              <Route path="/routes" element={<RequirePermission perm="driverDispatch"><RequireFeature feature="routeOptimization" name="Route Optimizer"><RouteOptimizer /></RequireFeature></RequirePermission>} />
              <Route path="/route-optimizer" element={<RequirePermission perm="driverDispatch"><RequireFeature feature="routeOptimization" name="Route Optimizer"><RouteOptimizer /></RequireFeature></RequirePermission>} />
              <Route path="/fleet" element={<RequirePermission perm="driverDispatch"><FleetMaintenance /></RequirePermission>} />
              <Route path="/driver-leaderboard" element={<RequirePermission perm="driverDispatch"><DriverLeaderboard /></RequirePermission>} />
              <Route path="/high-risk-queue" element={<RequirePermission perm="risksExceptions"><HighRiskQueuePage /></RequirePermission>} />
              <Route path="/security/high-risk" element={<RequirePermission perm="risksExceptions"><HighRiskQueuePage /></RequirePermission>} />
              <Route path="/user-roles" element={<RequirePermission perm="usersRoles"><UserRolesPage /></RequirePermission>} />
              <Route path="/settings/roles" element={<RequirePermission perm="usersRoles"><TenantUsersRolesPage /></RequirePermission>} />
              <Route path="/whatsapp" element={<RequirePermission perm="whatsapp"><RequireFeature feature="whatsapp" name="WhatsApp Hub"><WhatsAppHub /></RequireFeature></RequirePermission>} />
              <Route path="/communications/whatsapp" element={<RequirePermission perm="whatsapp"><RequireFeature feature="whatsapp" name="WhatsApp Hub"><WhatsAppHub /></RequireFeature></RequirePermission>} />
              <Route path="/email" element={<RequirePermission perm="email"><RequireFeature feature="emailHub" name="Email Hub"><EmailHub /></RequireFeature></RequirePermission>} />
              <Route path="/communications/email" element={<RequirePermission perm="email"><RequireFeature feature="emailHub" name="Email Hub"><EmailHub /></RequireFeature></RequirePermission>} />
              <Route path="/communications/client-queries" element={<RequirePermission perm="clientQueries"><ClientQueries /></RequirePermission>} />
              <Route path="/rate-cards" element={<RequirePermission perm="rateCards"><RateCards /></RequirePermission>} />
              <Route path="/billing-batches" element={<RequirePermission perm="billingBatches"><BillingBatches /></RequirePermission>} />
              <Route path="/billing/batches" element={<RequirePermission perm="billingBatches"><BillingBatches /></RequirePermission>} />
              <Route path="/billing/plans"   element={<RequirePermission perm="invoices"><BillingPlans /></RequirePermission>} />
              <Route path="/forwarding" element={<RequirePermission adminOnly><RequireFeature feature="freightForwarding" name="Freight Forwarding"><ForwardingConsole /></RequireFeature></RequirePermission>} />
              <Route path="/forwarding/:id" element={<RequirePermission adminOnly><RequireFeature feature="freightForwarding" name="Freight Forwarding"><ShipmentFilePage /></RequireFeature></RequirePermission>} />
              <Route path="/autopilot" element={<RequirePermission perm="aiControlTower"><RequireFeature feature="clawAutopilot" name="CLAW Autopilot"><AutopilotConsole /></RequireFeature></RequirePermission>} />
              <Route path="/settings/sso" element={<RequirePermission adminOnly><RequireFeature feature="sso" name="Single Sign-On"><SsoSettings /></RequireFeature></RequirePermission>} />
              <Route path="/finance" element={<RequirePermission perm="invoices"><FinanceDashboard /></RequirePermission>} />
              <Route path="/invoice-drafts" element={<RequirePermission perm="invoiceDrafts"><InvoiceDraftsPage /></RequirePermission>} />
              <Route path="/invoices" element={<RequirePermission perm="invoices"><Invoices /></RequirePermission>} />
              <Route path="/accounting" element={<RequirePermission perm="accounting"><RequireFeature feature="accounting" name="Accounting"><Accounting /></RequireFeature></RequirePermission>} />
              <Route path="/disbursements" element={<RequirePermission perm="accounting"><RequireFeature feature="accounting" name="Disbursements"><Disbursements /></RequireFeature></RequirePermission>} />
              {/* Client Portal Links — stub page shown until booking-portal backend ships */}
              <Route path="/billing/client-portal-links" element={<RequirePermission perm="creditControl"><ClientPortalLinks /></RequirePermission>} />
              <Route path="/credit-control" element={<RequirePermission perm="creditControl"><CreditControl /></RequirePermission>} />
              <Route path="/cod" element={<RequirePermission perm="billingBatches"><RequireFeature feature="codReconciliation" name="COD Reconciliation"><CODReconciliation /></RequireFeature></RequirePermission>} />
              <Route path="/cod/wallets/:driverId" element={<RequirePermission perm="billingBatches"><RequireFeature feature="codReconciliation" name="COD Reconciliation"><DriverWalletPage /></RequireFeature></RequirePermission>} />
              <Route path="/rate-shopping" element={<RequirePermission perm="rateCards"><RequireFeature feature="rateShopping" name="Rate Shopping"><RateShopping /></RequireFeature></RequirePermission>} />
              <Route path="/quotes" element={<RequirePermission perm="quotes"><QuotesPage /></RequirePermission>} />
              <Route path="/ai-control-tower" element={<RequirePermission perm="aiControlTower"><RequireFeature feature="aiControlTower" name="AI Control Tower"><AIControlTower /></RequireFeature></RequirePermission>} />
              <Route path="/ask" element={<RequirePermission perm="copilot"><RequireFeature feature="copilot" name="Ask FlowOps"><AskFlowOps /></RequireFeature></RequirePermission>} />
              <Route path="/copilot" element={<RequirePermission perm="copilot"><RequireFeature feature="copilot" name="Ask FlowOps"><AskFlowOps /></RequireFeature></RequirePermission>} />
              <Route path="/support" element={<RequireFeature feature="aiSupportAgent" name="AI Support Agent"><SupportAgent /></RequireFeature>} />
              <Route path="/couriers" element={<RequireFeature feature="courierManagement" name="Courier Management"><CourierManagement /></RequireFeature>} />
              <Route path="/logistics-analytics" element={<RequireFeature feature="logisticsAnalytics" name="Logistics Analytics"><LogisticsAnalytics /></RequireFeature>} />
              <Route path="/commercial-analytics" element={<RequireFeature feature="commercialAnalytics" name="Commercial Analytics"><CommercialAnalytics /></RequireFeature>} />
              <Route path="/wms" element={<RequireFeature feature="warehouseManagement" name="Warehouse Management"><WarehouseManagement /></RequireFeature>} />
              <Route path="/carriers" element={<RequirePermission perm="rateCards"><CarrierManagement /></RequirePermission>} />
              <Route path="/ai/control-tower" element={<RequirePermission perm="aiControlTower"><RequireFeature feature="aiControlTower" name="AI Control Tower"><AIControlTower /></RequireFeature></RequirePermission>} />
              <Route path="/depots" element={<RequirePermission perm="driverDispatch"><DepotsPage /></RequirePermission>} />
              <Route path="/onboarding" element={<OnboardingWizard />} />
              <Route path="/esg" element={<EsgDashboard />} />
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

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
