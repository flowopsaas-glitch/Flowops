import { useMemo, useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';
import { getToken } from '../api/client';

// Errors that occur routinely during dev hot-reload restarts or before login
// should NOT pollute the console. We only warn when a token is present (i.e.
// the user is logged-in and the error is genuinely unexpected).
const SILENT_ERRORS = new Set(['Invalid namespace', 'xhr poll error', 'timeout']);

export interface SocketSnapshot {
  socket: Socket | null;
  isConnected: boolean;
}

const DISCONNECTED: SocketSnapshot = { socket: null, isConnected: false };

/**
 * The socket is an external system: it is created/subscribed outside React's
 * render cycle and exposed through useSyncExternalStore, which is the
 * supported way to read mutable external state (and replaces the previous
 * "create in an effect, then setState the handle" shape).
 */
function createSocketStore(companyId: number | string) {
  let snapshot: SocketSnapshot = DISCONNECTED;
  let socket: Socket | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: SocketSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (companyId && !socket) {
      // Backend EventsGateway runs on the default namespace (/).
      // Use a *callback* for auth so every reconnect attempt reads the current
      // token from storage (handles token refresh and post-login reconnect).
      socket = io(FLOWOPS_WS_ORIGIN, {
        withCredentials: true,
        // Polling-first, then upgrade to WebSocket when available — resilient
        // to proxies/CDNs that block the WS upgrade (real-time still works via
        // polling).
        transports: ['polling', 'websocket'],
        auth: (cb: (data: Record<string, string>) => void) => {
          cb({ token: getToken() ?? '' });
        },
        autoConnect: true,
      });
      publish({ socket, isConnected: false });

      socket.on('connect', () => {
        socket?.emit('joinCompanyDashboard', { companyId: String(companyId) });
        if (socket) publish({ socket, isConnected: true });
      });

      socket.on('connect_error', (err) => {
        // Only surface in DEV when the user has a token — anything else is
        // expected noise (pre-login page loads, hot-reload restarts, etc.)
        if (import.meta.env.DEV && getToken() && !SILENT_ERRORS.has(err.message)) {
          console.warn('Socket connection failed:', err.message);
        }
        if (socket) publish({ socket, isConnected: false });
      });

      socket.on('disconnect', () => {
        if (socket) publish({ socket, isConnected: false });
      });
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && socket) {
        socket.disconnect();
        socket = null;
        snapshot = DISCONNECTED;
      }
    };
  };

  return { subscribe, getSnapshot: () => snapshot };
}

export const useSocket = (companyId: number | string): SocketSnapshot => {
  const store = useMemo(() => createSocketStore(companyId), [companyId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
};
