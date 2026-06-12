import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { FLOWOPS_HTTP_ORIGIN } from '@/lib/env';
import { clearSession, getAccessToken } from '@/lib/session';

export default function LogoutButton() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = getAccessToken();

      // Notify backend of logout
      if (token) {
        await fetch(`${FLOWOPS_HTTP_ORIGIN}/auth/logout`, {
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
      // Atomic logout via the session module — clears the canonical key AND
      // every legacy key (`token`, `user`, `session`, `isLoggedIn`, ...).
      clearSession();

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
