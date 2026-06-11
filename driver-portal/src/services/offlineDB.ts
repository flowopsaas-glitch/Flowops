import Dexie from 'dexie';
import type { Table } from 'dexie';

// Local database schema
export interface CachedWaybill {
  id?: number;
  waybillId: number;
  waybillNumber: string;
  data: any;
  cachedAt: Date;
  expiresAt: Date;
}

export interface QueuedAction {
  id?: number;
  type: 'POD_UPLOAD' | 'GPS_UPDATE' | 'STATUS_UPDATE';
  payload: any;
  createdAt: Date;
  retryCount: number;
  lastError?: string;
}

export interface OfflineStats {
  totalSynced: number;
  pendingActions: number;
  lastSyncAt?: Date;
  cacheSize: number;
}

class FlowOpsDB extends Dexie {
  waybills!: Table<CachedWaybill, number>;
  queue!: Table<QueuedAction, number>;

  constructor() {
    super('FlowOpsDriverDB');
    this.version(1).stores({
      waybills: '++id, waybillId, waybillNumber, cachedAt, expiresAt',
      queue: '++id, type, createdAt, retryCount',
    });
  }
}

export const db = new FlowOpsDB();

// Cache waybills locally
export async function cacheWaybills(waybills: any[]) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  await db.transaction('rw', db.waybills, async () => {
    // Clear old cache
    await db.waybills.clear();
    
    // Cache new data
    for (const waybill of waybills) {
      await db.waybills.add({
        waybillId: waybill.id,
        waybillNumber: waybill.waybillNumber,
        data: waybill,
        cachedAt: new Date(),
        expiresAt,
      });
    }
  });
  
  console.log(`✅ Cached ${waybills.length} waybills locally`);
}

// Get cached waybills
export async function getCachedWaybills(): Promise<any[]> {
  const cached = await db.waybills.toArray();
  return cached.map(c => c.data);
}

// Add action to offline queue
export async function queueAction(type: QueuedAction['type'], payload: any) {
  const id = await db.queue.add({
    type,
    payload,
    createdAt: new Date(),
    retryCount: 0,
  });
  
  console.log(`📦 Queued ${type} action (ID: ${id})`);
  return id;
}

// Get pending queue
export async function getPendingQueue(): Promise<QueuedAction[]> {
  return await db.queue.orderBy('createdAt').toArray();
}

// Process queue (sync when online)
export async function processQueue(apiCall: (action: QueuedAction) => Promise<void>) {
  const pending = await getPendingQueue();
  
  if (pending.length === 0) {
    console.log('✅ Queue is empty');
    return { processed: 0, failed: 0 };
  }
  
  let processed = 0;
  let failed = 0;
  
  for (const action of pending) {
    try {
      await apiCall(action);
      await db.queue.delete(action.id!);
      processed++;
      console.log(`✅ Synced action ${action.id} (${action.type})`);
    } catch (error: any) {
      failed++;
      // Increment retry count
      await db.queue.update(action.id!, {
        retryCount: action.retryCount + 1,
        lastError: error.message,
      });
      console.error(`❌ Failed to sync action ${action.id}:`, error.message);
      
      // Stop on first failure to maintain order
      break;
    }
  }
  
  return { processed, failed };
}

// Get offline stats
export async function getOfflineStats(): Promise<OfflineStats> {
  const pending = await getPendingQueue();
  const cached = await db.waybills.count();
  
  return {
    totalSynced: 0, // Track this separately if needed
    pendingActions: pending.length,
    cacheSize: cached,
  };
}

// Clear expired cache
export async function clearExpiredCache() {
  const now = new Date();
  await db.waybills.where('expiresAt').below(now).delete();
}

// Initialize DB
export async function initOfflineDB() {
  await db.open();
  await clearExpiredCache();
  console.log('✅ Offline database initialized');
}
