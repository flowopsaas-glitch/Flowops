import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../../lib/tenantAdminFullAccess';
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white grid place-items-center p-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="text-lg font-black">Loading FlowOps...</div>
          <div className="mt-2 text-sm text-white/60">
            Verifying your session
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
