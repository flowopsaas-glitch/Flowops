import { useEffect, useCallback, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';

/**
 * Premium real-time layer — matches Nest `BroadcastGateway` namespace `/broadcast`.
 * Benchmark: live fleet / dispatch surfaces (DispatchTrack-class ETA + ops visibility).
 */

export interface PremiumBroadcastEvent {
  type: 'risk' | 'shipment' | 'dispatch' | 'location' | 'geofence' | 'search' | 'billing' | 'inbox' | 'inbox-status';
  data: unknown;
  timestamp: Date;
}

interface UsePremiumWebSocketProps {
  companyId?: number;
  driverId?: number;
  collectionId?: number;
  onEvent?: (event: PremiumBroadcastEvent) => void;
  /** Inbox list refresh — server emits `waybill-inbox-changed` on upload / OCR / commit. */
  onWaybillInboxChanged?: () => void;
  enabled?: boolean;
}

export function usePremiumWebSocket({
  companyId,
  driverId,
  collectionId,
  onEvent,
  onWaybillInboxChanged,
  enabled = true,
}: UsePremiumWebSocketProps) {
  const socketRef = useRef<Socket | null>(null);
  // State mirror of the live socket: consumers receive it as a normal reactive
  // value instead of reading socketRef.current during render.
  const [socket, setSocket] = useState<Socket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to avoid unnecessary effect re-runs when callback logic changes
  const onEventRef = useRef(onEvent);
  const onInboxRef = useRef(onWaybillInboxChanged);

  // Keep the latest callbacks in refs (updated after render commits, never
  // during render) so event handlers never act on a stale closure.
  useEffect(() => {
    onEventRef.current = onEvent;
    onInboxRef.current = onWaybillInboxChanged;
  });

  // Self-reference for the reconnect retry: connect cannot name itself inside
  // its own initializer, so the retry calls through this ref instead.
  const connectRef = useRef<() => void>(() => undefined);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Cleanup existing connection before starting a new one
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    try {
      const base = FLOWOPS_WS_ORIGIN.replace(/\/+$/, '');
      const url = `${base}/broadcast`;

      socketRef.current = io(url, {

      transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 12,
        // Polling & Upgrade optimization
        upgrade: true,
        /* 🛡️ FIX: upgradeTimeout is deprecated/misnamed in newer versions, use requestTimeout */
        requestTimeout: 10000,
        rememberUpgrade: true,
        // Better connection detection
        forceNew: false,
        autoConnect: true,
        query: {
          EIO: '4',
        },
      });

      // --- Room Management ---
      setSocket(socketRef.current);

      socketRef.current.on('connect', () => {
        if (companyId) {
          socketRef.current?.emit('joinCompanyRoom', { companyId });
        }
        if (driverId) {
          socketRef.current?.emit('joinDriverLocation', { driverId });
        }
        if (collectionId) {
          socketRef.current?.emit('joinCollectionGeofence', { collectionId });
        }
      });

      // --- Error Handling & Logging ---
      socketRef.current.on('disconnect', (reason) => {
        if (import.meta.env.DEV) console.warn('Socket.IO disconnected:', reason);
      });

      socketRef.current.on('connect_error', (error) => {
        if (import.meta.env.DEV) console.warn('Socket.IO connection error:', error?.message);
      });

      socketRef.current.on('upgrade', () => {
        // Socket transport upgraded successfully.
      });

      // --- Event Forwarding Logic ---
      const forward = (type: PremiumBroadcastEvent['type']) => (data: unknown) => {
        onEventRef.current?.({
          type,
          data,
          timestamp: new Date(),
        });
      };

      // Standard Operational Listeners
      socketRef.current.on('risk-score-updated', forward('risk'));
      socketRef.current.on('shipment-status-changed', forward('shipment'));
      socketRef.current.on('dispatch-assigned', forward('dispatch'));
      socketRef.current.on('driver-location-updated', forward('location'));
      socketRef.current.on('geo-verification-status', forward('geofence'));
      socketRef.current.on('search-results-updated', forward('search'));
      socketRef.current.on('auto-invoice-completed', forward('billing'));

      // Inbox Specific Listeners
      socketRef.current.on('waybill-inbox-changed', (data: unknown) => {
        onEventRef.current?.({
          type: 'inbox',
          data,
          timestamp: new Date(),
        });
        onInboxRef.current?.();
      });

      socketRef.current.on('inbox-item-status-changed', (data: unknown) => {
        onEventRef.current?.({
          type: 'inbox-status',
          data,
          timestamp: new Date(),
        });
      });

    } catch (err) {
      console.error('Socket initialization failed:', err);
      reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), 3000);
    }
  }, [companyId, driverId, collectionId, enabled]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      if (import.meta.env.DEV) console.warn(`Cannot emit "${event}": Socket not connected.`);
    }
  }, []);

  const isConnected = useCallback((): boolean => {
    return socketRef.current?.connected ?? false;
  }, []);

  const getTransport = useCallback((): string => {
    // Accessing the internal engine transport name
    return (socketRef.current?.io as unknown as { engine?: { transport?: { name?: string } } })?.engine?.transport?.name ?? 'disconnected';
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    emit,
    isConnected,
    getTransport,
    socket,
  };
}
