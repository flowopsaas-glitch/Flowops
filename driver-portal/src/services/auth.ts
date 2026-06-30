// Driver session storage + auth calls.
// Single active session is enforced server-side (DriverAuthGuard): a login on a
// new device rotates the driver's session id, so this device's next call 401s
// and the api interceptor clears the session and returns to the PIN screen.

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const TOKEN_KEY = 'flowops.driver.token';
const DRIVER_KEY = 'flowops.driver';

export type Driver = {
  id: string;
  driverId?: string;
  name: string;
  phone: string;
  vehicleType?: string;
  vehicleReg?: string;
  status?: string;
  companyId: string;
  companyName?: string;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredDriver(): Driver | null {
  try {
    const raw = localStorage.getItem(DRIVER_KEY);
    return raw ? (JSON.parse(raw) as Driver) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(DRIVER_KEY);
}

function unwrap<T>(resData: any): T {
  return resData && typeof resData === 'object' && 'data' in resData ? resData.data : resData;
}

/** Phone + PIN login. Persists the token + driver and returns the driver. */
export async function login(phone: string, pin: string): Promise<Driver> {
  // Use a bare axios call (the shared instance's interceptors aren't needed here).
  const res = await axios.post(`${API_BASE}/driver-portal/login`, { phone, pin });
  const body = unwrap<{ access_token: string; driver: Driver }>(res.data);
  if (!body?.access_token || !body?.driver) throw new Error('Login failed');
  const driver: Driver = { ...body.driver, id: body.driver.id || (body.driver as any).driverId };
  localStorage.setItem(TOKEN_KEY, body.access_token);
  localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
  return driver;
}

/** Validate the current session against the server (used on app load). */
export async function fetchMe(): Promise<Driver> {
  const res = await axios.get(`${API_BASE}/driver-portal/me`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  });
  const driver = unwrap<Driver>(res.data);
  localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
  return driver;
}
