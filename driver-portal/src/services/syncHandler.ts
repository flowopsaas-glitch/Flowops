import { driverApi } from './api';
import type { QueuedAction } from './offlineDB';

// Process a queued action by calling the appropriate API
export async function syncAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'POD_UPLOAD':
      await driverApi.uploadPod(action.payload);
      break;
    
    case 'GPS_UPDATE':
      await driverApi.updateGps(
        action.payload.driverId,
        action.payload.lat,
        action.payload.lng,
        action.payload.speed
      );
      break;
    
    case 'STATUS_UPDATE':
      // Handle status updates if needed
      console.log('Status update sync:', action.payload);
      break;
    
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// Smart API call - tries online first, queues if offline
export async function smartApiCall<T>(
  onlineCall: () => Promise<T>,
  offlineQueue: { type: QueuedAction['type']; payload: any }
): Promise<{ success: boolean; queued: boolean; data?: T }> {
  if (navigator.onLine) {
    try {
      const data = await onlineCall();
      return { success: true, queued: false, data };
    } catch (error) {
      console.warn('Online call failed, queueing action:', error);
      // Fall through to queue
    }
  }
  
  // Queue for later
  const { queueAction } = await import('./offlineDB');
  await queueAction(offlineQueue.type, offlineQueue.payload);
  
  return { success: true, queued: true };
}
