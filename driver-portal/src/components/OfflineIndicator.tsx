import { RefreshCw, CloudOff, CheckCircle } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';
import type { QueuedAction } from '../services/offlineDB';

interface OfflineIndicatorProps {
  darkMode: boolean;
  apiCall?: (action: QueuedAction) => Promise<void>;
}

export default function OfflineIndicator({ apiCall }: OfflineIndicatorProps) {
  const { isOnline, pendingCount, isSyncing, lastSyncAt, sync, stats } = useOffline(apiCall);

  if (isOnline && pendingCount === 0) return null;

  const handleClick = () => {
    if (isOnline && pendingCount > 0) {
      sync();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`fixed bottom-20 right-4 z-30 backdrop-blur-xl border rounded-2xl px-4 py-3 shadow-2xl transition-all hover:scale-105 ${
        !isOnline
          ? 'bg-red-900/90 border-red-500/30'
          : pendingCount > 0
          ? 'bg-yellow-900/90 border-yellow-500/30 animate-pulse'
          : 'bg-green-900/90 border-green-500/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {!isOnline ? (
          <>
            <CloudOff className="w-5 h-5 text-red-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Offline Mode</div>
              <div className="text-xs text-red-200">Actions will sync later</div>
            </div>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Syncing...</div>
              <div className="text-xs text-blue-200">{pendingCount} pending</div>
            </div>
          </>
        ) : pendingCount > 0 ? (
          <>
            <RefreshCw className="w-5 h-5 text-yellow-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Tap to Sync</div>
              <div className="text-xs text-yellow-200">{pendingCount} pending action{pendingCount > 1 ? 's' : ''}</div>
            </div>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">All Synced</div>
              <div className="text-xs text-green-200">
                {stats.cacheSize} cached • {lastSyncAt ? 'Just now' : 'Never'}
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  );
}
