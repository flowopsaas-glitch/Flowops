import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';
import { getToken } from '../api/client';

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
      if (import.meta.env.DEV) {
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

