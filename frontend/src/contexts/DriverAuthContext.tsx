import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';

interface DriverProfile {
  id: number;
  name: string;
  vehicle: string;
  companyId?: number;
}

interface DriverAuthContextType {
  driver: DriverProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DriverAuthContext = createContext<DriverAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'flowops_driver';

export const DriverAuthProvider = ({ children }: { children: ReactNode }) => {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🔄 Restore driver session from localStorage (driver endpoints are driverId-based)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setDriver(JSON.parse(stored));
    } catch {
      setDriver(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (phone: string, pin: string) => {
    setIsLoading(true);
    try {
      // Uses the existing /driver-portal/login (phone + PIN, returns driver info)
      const data: any = await api.post('/driver-portal/login', { phone, pin });
      const profile: DriverProfile = {
        id: data?.driverId ?? data?.id,
        name: data?.name || 'Driver',
        vehicle: data?.vehicleReg || data?.vehicle || 'Fleet Unit',
        companyId: data?.companyId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setDriver(profile);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setDriver(null);
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
