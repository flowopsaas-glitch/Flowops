import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/auth-context";

/**
 * Route guard that requires the user to be authenticated.
 *
 * Supports two usage patterns:
 *
 *   1. As a React Router v6 **layout route** (no children — renders <Outlet />):
 *        <Route element={<ProtectedRoute />}>
 *          <Route path="/dashboard" element={<Dashboard />} />
 *        </Route>
 *
 *   2. As an **inline wrapper** (children passed explicitly):
 *        <ProtectedRoute><Dashboard /></ProtectedRoute>
 *
 * In both cases it:
 *  - Shows a loading screen while AuthContext is bootstrapping (checking /auth/me).
 *  - Redirects to /login (preserving the intended path in `location.state.from`)
 *    if the user is not authenticated.
 *  - Renders the protected content when authenticated.
 */
export default function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white grid place-items-center p-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="text-lg font-black">Loading FlowOps...</div>
          <div className="mt-2 text-sm text-white/60">Verifying your session</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Root path → show marketing landing page for unauthenticated visitors
    if (location.pathname === "/" || location.pathname === "") {
      return <Navigate to="/home" replace />;
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // When used as a layout route React Router does not pass children — render
  // the nested routes via <Outlet /> instead.
  return <>{children ?? <Outlet />}</>;
}
