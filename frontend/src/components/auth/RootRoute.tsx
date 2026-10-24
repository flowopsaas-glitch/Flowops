import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/auth-context";
import { isOwnerMode } from "../../api/client";
import PageLoader from "../PageLoader";
import { lazy, Suspense } from "react";

const LandingPage = lazy(() => import("../../pages/marketing/LandingPage"));

/**
 * Smart root route (/).
 *
 * - Still booting → show loader (avoids flash of landing page for logged-in users)
 * - Authenticated tenant → /dashboard
 * - Authenticated owner  → /owner/dashboard
 * - Not authenticated    → show the marketing landing page
 */
export default function RootRoute() {
  const { booting, isAuthenticated } = useAuth();

  if (booting) return <PageLoader />;

  if (isAuthenticated) {
    const dest = isOwnerMode() ? "/owner/dashboard" : "/dashboard";
    return <Navigate to={dest} replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <LandingPage />
    </Suspense>
  );
}
