import { api } from "../api/client";

/**
 * Offline-first Proof-of-Delivery queue for the driver PWA.
 *
 * Drivers often complete deliveries in areas with no signal. Instead of losing
 * the POD, we persist it to localStorage and replay it to the backend when
 * connectivity returns (on app load and on the browser 'online' event).
 */

const QUEUE_KEY = "flowops_pod_queue";

export type QueuedPod = {
  id: string; // local id
  waybillId: string;
  waybillNumber: string;
  recipient?: string;
  signatureDataUrl: string;
  queuedAt: string;
};

export function getPodQueue(): QueuedPod[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedPod[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function queuePod(pod: Omit<QueuedPod, "id" | "queuedAt">): QueuedPod {
  const entry: QueuedPod = {
    ...pod,
    id: `pod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  saveQueue([...getPodQueue(), entry]);
  return entry;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Replay every queued POD. Returns how many synced successfully. */
export async function syncPodQueue(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const queue = getPodQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: QueuedPod[] = [];

  for (const item of queue) {
    try {
      const formData = new FormData();
      formData.append(
        "signature",
        new File([dataUrlToBlob(item.signatureDataUrl)], `POD_${item.waybillNumber}.png`, {
          type: "image/png",
        }),
      );
      if (item.recipient) formData.append("recipient", item.recipient);
      await api.post(`/waybills/${item.waybillId}/complete`, formData);
      synced++;
    } catch {
      remaining.push(item); // keep for the next attempt
    }
  }

  saveQueue(remaining);
  return synced;
}

/** Register a one-time listener that flushes the queue when connectivity returns. */
export function registerPodAutoSync(onSynced?: (count: number) => void) {
  const handler = async () => {
    const n = await syncPodQueue();
    if (n > 0 && onSynced) onSynced(n);
  };
  window.addEventListener("online", handler);
  // Also attempt immediately (covers app-load-while-online).
  void handler();
  return () => window.removeEventListener("online", handler);
}
