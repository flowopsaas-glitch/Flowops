import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';

// Tracking gateway lives under the `/tracking-dashboard` namespace.
const SOCKET_URL = `${FLOWOPS_WS_ORIGIN}/tracking-dashboard`;

export const useSocket = (companyId: number | string) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    // Initialize using WebSocket transports to route around host proxy blocks safely
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"], 
      autoConnect: true,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("joinCompanyDashboard", { companyId: Number(companyId) });
    });

    socket.on("connect_error", (err) => {
      if (import.meta.env.DEV) {
        console.warn("Socket connection failed:", err.message);
      }
      setIsConnected(false);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      if (socket) socket.disconnect();
    };
  }, [companyId]);

  return { socket: socketRef.current, isConnected };
};

