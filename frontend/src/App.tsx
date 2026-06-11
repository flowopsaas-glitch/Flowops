// frontend/src/App.tsx
import { useEffect, lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { io } from "socket.io-client";
import { Toaster } from "sonner";

// Eager imports (initial shell)
import AppLayout from "./components/layout/AppLayout";
import OwnerLayout from "./components/layout/OwnerLayout";
import OwnerRoute from "./components/owner/OwnerRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PageLoader from "./components/PageLoader";
import FleetMap from './pages/FleetMap';
import DriverAnalytics from './pages/DriverAnalytics';
const Analytics = lazy(() => import('./pages/Analytics'));
const DispatcherConsole = lazy(() => import('./pages/tools/dispatch/DispatcherConsole'));
import DispatchChat from './pages/DispatchChat';

// ============================================================================
// 📦 LAZY-LOADED PAGES (Performance Optimized)
// ============================================================================

// Core pages
const LoginPage = lazy(() => import("./pages/LoginPage"));
const TrackPublic = lazy(() => import("./pages/track/TrackPublic"));
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
const ClientPortal = lazy(() => import("./pages/portal/ClientPortal"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const AIControlTower = lazy(() => import("./pages/AIControlTower"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const WhatsAppHub = lazy(() => import("./pages/automation/WhatsAppHub"));
const EmailHub = lazy(() => import("./pages/automation/EmailHub"));
const ClientQueries = lazy(() => import("./pages/communications/ClientQueries"));

// ============================================================================
// 📦 NEW: INVENTORY MANAGEMENT PAGES
// ============================================================================
const InventoryDashboard = lazy(() => import("./pages/inventory/Dashboard"));
const InventoryItems = lazy(() => import("./pages/inventory/Items"));
const InventoryWarehouses = lazy(() => import("./pages/inventory/Warehouses"));
const InventoryMovements = lazy(() => import("./pages/inventory/Movements"));
const InventoryAlerts = lazy(() => import("./pages/inventory/Alerts"));
const LiveTracking = lazy(() => import("./pages/gps-tracking/LiveTracking"));

// Owner pages (lazy-loaded)
const SuperAdminDashboard = lazy(() => import("./pages/owner/SuperAdminDashboard"));
const SuperTenantDashboard = lazy(() => import("./pages/superadmin/SuperTenantDashboard"));
const SuperAdminSettings = lazy(() => import("./pages/superadmin/SuperAdminSettings"));
const SuperAdminTenants = lazy(() => import("./pages/superadmin/SuperAdminTenants"));
const SuperAdminBilling = lazy(() => import("./pages/superadmin/SuperAdminBilling"));
const SuperAdminUsers = lazy(() => import("./pages/superadmin/SuperAdminUsers"));
const SuperAdminDispatches = lazy(() => import("./pages/superadmin/SuperAdminDispatches"));
const SuperAdminHealth = lazy(() => import("./pages/superadmin/SuperAdminHealth"));
const OwnerTenants = lazy(() => import("./pages/owner/OwnerTenants"));
const OwnerAccessManager = lazy(() => import("./pages/owner/OwnerAccessManager"));
const PasswordManager = lazy(() => import("./pages/owner/PasswordManager"));

// Driver pages
const DriverManifest = lazy(() => import("./pages/driver/DriverManifest"));
const DriverPortalPage = lazy(() => import("./pages/driver/DriverPortalPage"));

// Admin pages
const TenantUsersRolesPage = lazy(() => import("./pages/admin/TenantUsersRolesPage"));

// Other pages
const ManifestsPage = lazy(() => import("./pages/ManifestsPage"));
const HighRiskQueuePage = lazy(() => import("./pages/HighRiskQueuePage"));
const UserRolesPage = lazy(() => import("./pages/UserRolesPage"));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const StatusPage = lazy(() => import('./pages/Status'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetup'));
// 🤖 AI Features (Lazy loaded)
const AIFeaturesDashboard = lazy(() => import('./components/AIFeaturesDashboard').then(m => ({ default: m.AIFeaturesDashboard })));
const AIFraudDetection = lazy(() => import('./pages/AIFraudDetection').then(m => ({ default: m.AIFraudDetection })));
const AIDynamicPricing = lazy(() => import('./pages/AIDynamicPricing').then(m => ({ default: m.AIDynamicPricing })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));


// ============================================================================
// 🔐 ROUTE PROTECTION
// ============================================================================
function ProtectedRoute() {
  const token = localStorage.getItem("access_token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// ============================================================================
// 🚀 MAIN APP COMPONENT
// ============================================================================
export default function App() {
  useEffect(() => {
    const envApiUrl = import.meta.env.VITE_FLOWOPS_API_URL || "http://localhost:3000/api/v1";
    const backendUrl = envApiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");

    const socket = io(`${backendUrl}`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      console.log("🟢 FlowOps UI Connected to Live Guardian Bridge.");
    });

    socket.on("connect_error", (err) => {
      console.warn(`⚠️ WebSocket connection failed. Is the FlowOps backend running at ${backendUrl}?`, err.message);
    });

    socket.on("system-ui-heal", (payload: { action: string; reason: string }) => {
      console.error(`🚨 SYSTEM DISCREPANCY DETECTED BY WATCHDOG: ${payload.reason}`);
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
        <Toaster 
          position="top-right" 
          theme="dark" 
          richColors 
          closeButton
          duration={4000}
        />
        
        <Routes>
          {/* ================================================================== */}
          {/* 🌐 PUBLIC ROUTES (No authentication required) */}
          {/* ================================================================== */}
          <Route path="/track/:token" element={<Suspense fallback={<PageLoader />}><TrackPublic /></Suspense>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/client-portal" element={<ClientPortal />} />
          <Route path="/legal/terms" element={<TermsPage />} />
          <Route path="/legal/privacy" element={<PrivacyPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/setup" element={<CompanySetupPage />} />
          <Route path="/driver/portal" element={<DriverPortalPage />} />
          <Route path="/driver/manifest/:id" element={<DriverManifest />} />

          {/* 🔧 TEMPORARY DEBUG ROUTE - REMOVE AFTER TESTING */}
          <Route path="/debug-dispatch" element={
            <div className="h-screen bg-[#0f172a] text-white flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-4"> DISPATCH DEBUG MODE</h1>
                <p className="text-slate-400 mb-6">Token: {localStorage.getItem('access_token') ? '✅ EXISTS' : '❌ MISSING'}</p>
                <button 
                  onClick={() => {
                    fetch('http://localhost:3000/api/v1/auth/login', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({email: 'dispatcher@flowops.work', password: 'Dispatcher123!'})
                    })
                    .then(r => r.json())
                    .then(d => {
                      localStorage.setItem('access_token', d.accessToken);
                      window.location.href = '/tools/dispatch';
                    });
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold"
                >
                  FORCE LOGIN & GO TO DISPATCH
                </button>
              </div>
            </div>
          } />


          {/* ================================================================== */}
          {/* 👑 OWNER ROUTES (SUPER_ADMIN/ADMIN only) */}
          {/* ================================================================== */}
          <Route element={<OwnerRoute />}>
            <Route element={<OwnerLayout />}>
              <Route path="/owner" element={<Navigate to="/owner/dashboard" replace />} />
              <Route path="/owner/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/owner/tenants" element={<OwnerTenants />} />
              <Route path="/owner/access" element={<OwnerAccessManager />} />
              <Route path="/owner/passwords" element={<PasswordManager />} />
            </Route>
          </Route>

          {/* ================================================================== */}
          {/* 🔒 PROTECTED ROUTES (All authenticated users) */}
          {/* ================================================================== */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              
              {/* Core Navigation */}
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

              <Route path="/fleet-map" element={<FleetMap />} />
              <Route path="/driver-analytics" element={<DriverAnalytics />} />
              <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><Analytics /></Suspense>} />
              <Route path="/dispatch-chat" element={<DispatchChat />} />
          {/* ================================================================== */}
          {/* 🤖 AI FEATURES ROUTES */}
          {/* ================================================================== */}
          <Route path="/ai-features" element={<Suspense fallback={<PageLoader />}><AIFeaturesDashboard /></Suspense>} />
          <Route path="/ai/fraud-detection" element={<Suspense fallback={<PageLoader />}><AIFraudDetection /></Suspense>} />
          <Route path="/ai/dynamic-pricing" element={<Suspense fallback={<PageLoader />}><AIDynamicPricing /></Suspense>} />

              <Route path="/manifests" element={<ManifestsPage />} />
              <Route path="/high-risk-queue" element={<HighRiskQueuePage />} />
              <Route path="/security/high-risk" element={<HighRiskQueuePage />} />
              <Route path="/user-roles" element={<UserRolesPage />} />
              <Route path="/settings/roles" element={<TenantUsersRolesPage />} />

              {/* Communications */}
              <Route path="/whatsapp" element={<WhatsAppHub />} />
              <Route path="/communications/whatsapp" element={<WhatsAppHub />} />
              <Route path="/email" element={<EmailHub />} />
              <Route path="/communications/email" element={<EmailHub />} />
              <Route path="/communications/client-queries" element={<ClientQueries />} />

              {/* Billing & Finance */}
              <Route path="/rate-cards" element={<RateCards />} />
              <Route path="/billing-batches" element={<BillingBatches />} />
              <Route path="/billing/batches" element={<BillingBatches />} />
              <Route path="/invoice-drafts" element={<InvoiceDraftsPage />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/billing/client-portal-links" element={<ClientPortalLinks />} />
              <Route path="/credit-control" element={<ClientPortalLinks />} />
              <Route path="/quotes" element={<QuotesPage />} />

              {/* AI & Intelligence */}
              <Route path="/ai-control-tower" element={<AIControlTower />} />
              <Route path="/ai/control-tower" element={<AIControlTower />} />

              {/* ================================================================== */}
              {/* 📦 INVENTORY MANAGEMENT ROUTES */}
              {/* ================================================================== */}
              <Route path="/inventory" element={<InventoryDashboard />} />
              <Route path="/inventory/dashboard" element={<InventoryDashboard />} />
              <Route path="/inventory/items" element={<InventoryItems />} />
              <Route path="/inventory/warehouses" element={<InventoryWarehouses />} />
              <Route path="/inventory/movements" element={<InventoryMovements />} />
              <Route path="/inventory/alerts" element={<InventoryAlerts />} />
              <Route path="/live-tracking" element={<LiveTracking />} />
              <Route path="/inventory/stock" element={<InventoryItems />} />
              <Route path="/inventory/catalog" element={<InventoryItems />} />

              {/* Settings */}
              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {/* ================================================================== */}
          {/* 👑 SUPERADMIN STANDALONE ROUTES (own layout, no AppLayout wrapper) */}
          {/* ================================================================== */}
          <Route element={<ProtectedRoute />}>
            <Route path="/superadmin" element={<Suspense fallback={<PageLoader />}><SuperTenantDashboard /></Suspense>} />
            <Route path="/superadmin/companies" element={<Suspense fallback={<PageLoader />}><SuperAdminTenants /></Suspense>} />
            <Route path="/superadmin/users" element={<Suspense fallback={<PageLoader />}><SuperAdminUsers /></Suspense>} />
            <Route path="/superadmin/billing" element={<Suspense fallback={<PageLoader />}><SuperAdminBilling /></Suspense>} />
            <Route path="/superadmin/dispatches" element={<Suspense fallback={<PageLoader />}><SuperAdminDispatches /></Suspense>} />
            <Route path="/superadmin/health" element={<Suspense fallback={<PageLoader />}><SuperAdminHealth /></Suspense>} />
            <Route path="/superadmin/settings" element={<Suspense fallback={<PageLoader />}><SuperAdminSettings /></Suspense>} />
          </Route>

          {/* 👑 SUPERADMIN ROUTE */}

          {/* ================================================================== */}
          {/* 🎯 CATCH-ALL REDIRECT */}
          {/* ================================================================== */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
