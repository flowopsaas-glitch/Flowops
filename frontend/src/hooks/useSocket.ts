// /opt/Flowops/frontend/src/hooks/useSocket.ts
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// ✅ FIX: Use environment variable with fallback to port 3000 (no namespace)
const SOCKET_URL = import.meta.env.VITE_WS_ORIGIN || 'http://localhost:3000';

export const useSocket = (companyId: number | string) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    // Initialize socket with correct URL and transports
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'], // Allow fallback to polling
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('📡 Socket connected to:', SOCKET_URL);
      
      // Join company room (matches backend event name)
      socket.emit('joinCompanyRoom', { companyId: Number(companyId) });
    });

    socket.on('connect_error', (err) => {
      console.error('📡 Socket connection error:', err.message);
      setIsConnected(false);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('📡 Socket disconnected');
    });

    socket.on('joined-room', (data) => {
      console.log('✅ Joined room:', data);
    });

    socketRef.current = socket;

    return () => {
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [companyId]);

  return { socket: socketRef.current, isConnected };
};
