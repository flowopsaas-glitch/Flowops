import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ 
  children, 
  allowedRoles = ['ADMIN', 'DISPATCHER', 'WAREHOUSE_CLERK', 'ULTIMATE_OWNER', 'SUPER_ADMIN'] 
}: ProtectedRouteProps) {
  const { isAuthenticated, booting, user } = useAuth();
  const location = useLocation();

  console.log('️ ProtectedRoute:', { 
    path: location.pathname,
    booting, 
    isAuthenticated, 
    userRole: user?.role 
  });

  if (booting) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f172a]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Save intended destination for post-login redirect
    sessionStorage.setItem('redirectAfterLogin', location.pathname);
    return <Navigate to="/login" replace />;
  }

  const userRole = String(user.role || '').toUpperCase();
  
  if (!allowedRoles.includes(userRole)) {
    console.log(` Role ${userRole} not authorized for ${location.pathname}`);
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
