import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken, getLoginMode } from '../../api/client';
import { canTenantAdminAccessRoute } from '../../lib/tenantAdminFullAccess';

// Simple user object derived from auth state
function getAuthUser() {
  const token = getToken();
  if (!token) return null;
  try {
    // Decode JWT payload (base64)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { role: payload.role || 'USER', isSuperAdmin: payload.role === 'ADMIN', ...payload };
  } catch {
    return { role: 'USER', isSuperAdmin: false };
  }
}

export default function AuthGuard() {
  const location = useLocation();
  const token = getToken();

  // Not authenticated → login
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // RBAC: owner-mode users can only access /owner paths
  const mode = getLoginMode();
  if (mode === 'owner' && !location.pathname.startsWith('/owner')) {
    return <Navigate to="/owner" replace />;
  }

  // RBAC: tenant users can't access /owner paths
  if (mode !== 'owner' && location.pathname.startsWith('/owner')) {
    return <Navigate to="/dashboard" replace />;
  }

  // RBAC: admin-only routes
  const user = getAuthUser();
  if (location.pathname.includes('/admin') && user && !canTenantAdminAccessRoute(location.pathname, user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
