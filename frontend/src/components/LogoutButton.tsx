import { useNavigate } from 'react-router-dom';
import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Notify backend of logout
      if (token) {
        await fetch('http://localhost:3000/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }).catch(err => console.error('Logout notification failed:', err));
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear all session data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('isLoggedIn');

      // Redirect to login
      navigate('/login', { replace: true });
    }
  };

  return (
    <Button
      onClick={handleLogout}
      variant="outline"
      size="sm"
      className="text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      <LogOut className="h-4 w-4 mr-2" />
      Logout
    </Button>
  );
}

