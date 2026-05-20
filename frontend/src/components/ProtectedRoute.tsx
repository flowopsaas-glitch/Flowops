import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, booting, user } = useAuth();

  // Show loading state while checking authentication
  if (booting) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role if required
  if (requiredRole && user?.role) {
    const normalizedUserRole = String(user.role).toUpperCase();
    const normalizedRequiredRole = String(requiredRole).toUpperCase();
    
    if (normalizedUserRole !== normalizedRequiredRole && normalizedUserRole !== 'ULTIMATE_OWNER' && normalizedUserRole !== 'SUPER_ADMIN') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

