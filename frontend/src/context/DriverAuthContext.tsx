// src/contexts/DriverAuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { api } from "../lib/api"; // Your Axios instance

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
}

interface DriverAuthContextType {
  driver: Driver | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => void;
}

const DriverAuthContext = createContext<DriverAuthContextType | undefined>(
  undefined,
);

export const DriverAuthProvider = ({ children }: { children: ReactNode }) => {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initial check on load
  useEffect(() => {
    const verifySession = async () => {
      try {
        // This endpoint will check the HttpOnly cookie and return the driver profile
        const { data } = await api.get("/api/auth/me");
        if (data.role === "DRIVER") {
          setDriver(data);
        }
      } catch (error) {
        setDriver(null);
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = async (phone: string, pin: string) => {
    // We hit the endpoint you already mapped in your logs: /api/auth/driver-login
    const { data } = await api.post("/api/auth/driver-login", { phone, pin });
    setDriver(data.driver);
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setDriver(null);
  };

  return (
    <DriverAuthContext.Provider
      value={{ driver, isAuthenticated: !!driver, isLoading, login, logout }}
    >
      {children}
    </DriverAuthContext.Provider>
  );
};

export const useDriverAuth = () => {
  const context = useContext(DriverAuthContext);
  if (context === undefined) {
    throw new Error("useDriverAuth must be used within a DriverAuthProvider");
  }
  return context;
};
