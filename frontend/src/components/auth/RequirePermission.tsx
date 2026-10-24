import { type ReactNode, useMemo } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/auth-context";
import {
  normalizeTenantNavPermissions,
  type TenantNavPermissionKey,
} from "../../lib/tenantUserPermissions";

const TENANT_ADMIN_ROLES = [
  "ADMIN",
  "COMPANY_ADMIN",
  "TENANT_ADMIN",
  "SUPER_ADMIN",
  "ULTIMATE_OWNER",
];

/**
 * Route guard that enforces the tenant nav-permission matrix at the URL layer.
 *
 * This is the enforcement counterpart to the sidebar filtering in AppLayout —
 * hiding a link is not access control on its own, since a user can type the
 * URL directly. Both surfaces read from the same source of truth
 * (`tenantUserPermissions`) so what a user can see always matches what they
 * can open.
 *
 * Usage (wraps the protected element):
 *   <Route path="/settings" element={
 *     <RequirePermission perm="settings"><SettingsPage /></RequirePermission>
 *   } />
 *
 * Or as a layout route via <Outlet />. Unauthorized users are redirected to
 * /dashboard (which every authenticated tenant user can access).
 */
export default function RequirePermission({
  perm,
  adminOnly,
  children,
}: {
  perm?: TenantNavPermissionKey;
  adminOnly?: boolean;
  children?: ReactNode;
}) {
  const { user } = useAuth();

  const perms = useMemo(
    () =>
      normalizeTenantNavPermissions(
        user?.permissions ?? user?.navPermissions,
        user?.role,
      ),
    [user],
  );

  const isTenantAdmin = useMemo(() => {
    const role = String(user?.role || "").toUpperCase();
    return (
      TENANT_ADMIN_ROLES.includes(role) ||
      Boolean(user?.isSuperAdmin) ||
      Boolean(user?.isUltimateOwner)
    );
  }, [user]);

  if (adminOnly && !isTenantAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (perm && !perms[perm]) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
