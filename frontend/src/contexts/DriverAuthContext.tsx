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
        // Path is relative to baseURL, ensuring NO /api/api doubling
        const { data: ref } = await api.post('/auth/refresh');
        setMemoryToken(ref.accessToken);

        const { data: me } = await api.get('/auth/me');
        if (me.role === 'DRIVER') {
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
      const { data } = await api.post('/auth/driver-login', { phone, pin });
      setMemoryToken(data.accessToken);
      setDriver(data.driver);
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
