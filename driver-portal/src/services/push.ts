// Driver push-notification enrolment.
//
// Honest platform reality baked in:
//  - Works on Android/Chrome and on INSTALLED PWAs.
//  - iOS only supports web push if the app is "Add to Home Screen"-installed
//    (iOS 16.4+), and delivery is throttled. We detect and message this.
//  - If push isn't supported/enabled, the in-app job list still works — the
//    driver is never stranded.
import api from './api';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS needs the PWA installed (standalone) before push can work at all. */
export function iosNeedsInstall(): boolean {
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = (window.navigator as any).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !standalone;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask permission, subscribe via the service worker, and register the
 * subscription with the backend. Returns a status string for the UI.
 */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported' | 'ios-install' | 'server-off' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  if (iosNeedsInstall()) return 'ios-install';

  try {
    // Server must have VAPID keys configured.
    const keyRes: any = await api.get('/push/vapid-public-key');
    const publicKey = keyRes?.publicKey;
    if (!publicKey) return 'server-off';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = sub.toJSON() as any;
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
    return 'enabled';
  } catch {
    return 'error';
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch { /* best-effort */ }
}
