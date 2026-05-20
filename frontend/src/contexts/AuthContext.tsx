import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import api, { clearClientSession, getLoginMode, getToken, setLoginMode, setToken } from '../api/client';

const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<any>(null);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      clearClientSession();
      setUser(null);
    } finally { setBooting(false); }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = async (args: any) => {
    // Separate endpoints for platform Owners vs Tenants/Clients
    const endpoint = args.mode === "owner" ? "/auth/owner-login" : "/auth/login";
    const { data } = await api.post(endpoint, { 
      email: args.email, 
      password: args.password,
      mode: args.mode // Tells backend if this is a Client vs Tenant login
    });
    
    setToken(data.accessToken || data.token);
    setLoginMode(args.mode || "tenant");
    setUser(data.user || data);
  };

  const logout = () => {
    api.post("/auth/logout").finally(() => {
      clearClientSession();
      setUser(null);
    });
  };

  return (
    <AuthContext.Provider value={{ booting, user, isAuthenticated: !!user, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
