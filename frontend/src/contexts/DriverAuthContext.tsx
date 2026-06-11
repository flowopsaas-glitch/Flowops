import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setMemoryToken } from '../api/client';

interface DriverProfile { id: number; name: string; vehicle: string; }

interface DriverAuthContextType {
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DriverAuthContext = createContext<DriverAuthContextType | undefined>(undefined);

export const DriverAuthProvider = ({ children }: { children: ReactNode }) => {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🔄 Silent Session Bootstrap
  useEffect(() => {
    const verify = async () => {
      try {
        // api client interceptor returns response.data directly
        const ref: any = await api.post('/auth/refresh');
        if (ref?.accessToken) setMemoryToken(ref.accessToken);

        const me: any = await api.get('/auth/me');
        if (me?.role === 'DRIVER') {
          setDriver({ id: me.id, name: me.name, vehicle: me.vehicle || 'Fleet Unit' });
        }
      } catch {
        setDriver(null);
      } finally { setIsLoading(false); }
    };
    verify();
  }, []);

  const login = async (phone: string, pin: string) => {
    setIsLoading(true);
    try {
      const data: any = await api.post('/auth/driver-login', { phone, pin });
      if (data?.accessToken) {
        setMemoryToken(data.accessToken);
        localStorage.setItem('access_token', data.accessToken);
      }
      setDriver(data?.driver || null);
    } finally { setIsLoading(false); }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } finally {
      setMemoryToken(null);
      setDriver(null);
    }
  };

  return (
    <DriverAuthContext.Provider value={{ driver, isAuthenticated: !!driver, isLoading, login, logout }}>
      {children}
    </DriverAuthContext.Provider>
  );
};

export const useDriverAuth = () => {
  const ctx = useContext(DriverAuthContext);
  if (!ctx) throw new Error('useDriverAuth must be used within DriverAuthProvider');
  return ctx;
};
