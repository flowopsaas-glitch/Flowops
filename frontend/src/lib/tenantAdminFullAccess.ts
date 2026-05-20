/**
 * Utility for managing Tenant Admin permissions and route access.
 */

export const isTenantAdminFullAccess = (user: any): boolean => {
  // Logic to check if the user has master admin rights
  return !!user?.isSuperAdmin || user?.role === 'ADMIN';
};

export const canTenantAdminSeeNavItem = (navItem: any, user: any): boolean => {
  if (!user) return false;
  if (navItem.requiredRole && user.role !== navItem.requiredRole) return false;
  return true;
};

export const canTenantAdminAccessRoute = (path: string, user: any): boolean => {
  if (!user) return false;
  // Prevent non-admins from reaching sensitive paths
  if (path.includes('/admin') && user.role !== 'ADMIN') return false;
  return true;
};

export const isHiddenOwnerPath = (path: string): boolean => {
  const hiddenPaths = ['/owner-dashboard', '/system-config'];
  return hiddenPaths.includes(path);
};
