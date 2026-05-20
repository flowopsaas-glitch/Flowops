import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// 🚀 THE FIX: Shift target port from 3000 to 3005, and align with the tracking-dashboard namespace
const SOCKET_URL = "http://localhost:3005/tracking-dashboard";

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
      console.log("📡 Tactical OS Signal established via Port 3005");
      
      // Map straight to the room allocation handler registered inside your NestJS backend gateway
      socket.emit("joinCompanyDashboard", { companyId: Number(companyId) });
    });

    socket.on("connect_error", (err) => {
      console.error("📡 Signal Interrupted:", err.message);
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

