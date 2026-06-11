import { useState, useEffect, useCallback } from 'react';
import { 
  initOfflineDB, 
  processQueue, 
  getOfflineStats,
  type QueuedAction 
} from '../services/offlineDB';

interface UseOfflineReturn {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  sync: () => Promise<{ processed: number; failed: number }>;
  stats: { pendingActions: number; cacheSize: number };
}

export function useOffline(apiCall?: (action: QueuedAction) => Promise<void>): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [stats, setStats] = useState({ pendingActions: 0, cacheSize: 0 });

  // Initialize DB
  useEffect(() => {
    initOfflineDB().then(updateStats);
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (apiCall) sync();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [apiCall]);

  // Update stats periodically
  const updateStats = async () => {
    const newStats = await getOfflineStats();
    setStats(newStats);
    setPendingCount(newStats.pendingActions);
  };

  useEffect(() => {
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Sync function
  const sync = useCallback(async () => {
    if (!apiCall || isSyncing) return { processed: 0, failed: 0 };
    
    setIsSyncing(true);
    try {
      const result = await processQueue(apiCall);
      setLastSyncAt(new Date());
      await updateStats();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [apiCall, isSyncing]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncAt,
    sync,
    stats,
  };
}
