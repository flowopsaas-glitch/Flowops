import { createContext, useContext } from 'react';
import type { DriverAuthContextType } from './DriverAuthContext';

/**
 * Driver-auth context + hook live apart from DriverAuthProvider so the
 * provider file only exports a component (react-refresh).
 */
export const DriverAuthContext = createContext<DriverAuthContextType | undefined>(undefined);

export const useDriverAuth = () => {
  const ctx = useContext(DriverAuthContext);
  if (!ctx) throw new Error('useDriverAuth must be used within DriverAuthProvider');
  return ctx;
};
