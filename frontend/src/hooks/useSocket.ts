import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';
import { getToken } from '../api/client';

// Errors that occur routinely during dev hot-reload restarts or before login
// should NOT pollute the console. We only warn when a token is present (i.e.
// the user is logged-in and the error is genuinely unexpected).
const SILENT_ERRORS = new Set(['Invalid namespace', 'xhr poll error', 'timeout']);

export const useSocket = (companyId: number | string) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    // Backend EventsGateway runs on the default namespace (/).
    // Use a *callback* for auth so every reconnect attempt reads the current
    // token from storage (handles token refresh and post-login reconnect).
    const socket = io(FLOWOPS_WS_ORIGIN, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: (cb: (data: Record<string, string>) => void) => {
        cb({ token: getToken() ?? '' });
      },
      autoConnect: true,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('joinCompanyDashboard', { companyId: String(companyId) });
    });

    socket.on('connect_error', (err) => {
      // Only surface in DEV when the user has a token — anything else is
      // expected noise (pre-login page loads, hot-reload restarts, etc.)
      if (import.meta.env.DEV && getToken() && !SILENT_ERRORS.has(err.message)) {
        console.warn('Socket connection failed:', err.message);
      }
      setIsConnected(false);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      if (socket) socket.disconnect();
    };
  }, [companyId]);

  return { socket: socketRef.current, isConnected };
};

