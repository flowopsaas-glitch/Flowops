import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: number;
  email: string;
  role: string;
  companyId: number;
  name?: string;
  isVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  booting: true,
  login: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  // ✅ EXPLICIT TOKEN RETRIEVAL - NO AMBIGUITY
  const getToken = (): string | null => {
    const t = localStorage.getItem('access_token');
    console.log(' getToken() returned:', t ? t.substring(0, 15) + '...' : 'NULL');
    return t;
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('🔐 Login attempt:', email);
      
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Login failed');
      }

      const data = await response.json();
      
      // ✅ STORE TOKEN EXPLICITLY
      localStorage.setItem('access_token', data.accessToken);
      console.log('✅ Token stored in localStorage');
      
      setUser(data.user);
      
      // ✅ IMMEDIATE REDIRECT BASED ON ROLE
      const role = data.user?.role?.toUpperCase();
      const path = role === 'SUPER_ADMIN' ? '/superadmin' : role === 'DISPATCHER' ? '/tools/dispatch' : '/dashboard';
      console.log(' Redirecting to:', path);
      window.location.href = path;
      
    } catch (err: any) {
      console.error('❌ Login error:', err.message);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
    window.location.href = '/login';
  };

  // ✅ AUTH CHECK ON MOUNT
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      
      if (!token) {
        console.log('⚠️ No token found, setting booting=false');
        setBooting(false);
        return;
      }

      try {
        console.log('🔄 Validating token with backend...');
        const res = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        setUser(res.data);
        console.log('✅ Auth validated:', res.data.email, res.data.role);
      } catch (err: any) {
        console.error('❌ Token invalid, clearing storage');
        localStorage.removeItem('access_token');
        setUser(null);
      } finally {
        setBooting(false);
      }
    };

    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      booting, 
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};
