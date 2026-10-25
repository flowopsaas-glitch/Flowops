/**
 * Utility for managing Tenant Admin permissions and route access.
 */

type TenantAccessUser = { isSuperAdmin?: boolean; role?: string } | null | undefined;
type TenantNavItemLike = { requiredRole?: string };

export const isTenantAdminFullAccess = (user: TenantAccessUser): boolean => {
  // Logic to check if the user has master admin rights
  return !!user?.isSuperAdmin || user?.role === 'ADMIN';
};

export const canTenantAdminSeeNavItem = (navItem: TenantNavItemLike, user: TenantAccessUser): boolean => {
  if (!user) return false;
  if (navItem.requiredRole && user.role !== navItem.requiredRole) return false;
  return true;
};

export const canTenantAdminAccessRoute = (path: string, user: TenantAccessUser): boolean => {
  if (!user) return false;
  // Prevent non-admins from reaching sensitive paths
  if (path.includes('/admin') && user.role !== 'ADMIN') return false;
  return true;
};

export const isHiddenOwnerPath = (path: string): boolean => {
  const hiddenPaths = ['/owner-dashboard', '/system-config'];
  return hiddenPaths.includes(path);
};
