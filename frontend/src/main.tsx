import './lib/hardening';
import { initSentry } from './lib/sentry';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './styles/futuristic.css';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { registerSW } from 'virtual:pwa-register';
import { initObservatory } from './lib/observatory';
import { initIntegrityTripwire } from './lib/integrity';
import ObservatoryErrorBoundary from './components/ObservatoryErrorBoundary';

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('A critical FlowOps system update is ready. Reload to sync all devices?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    // PWA is ready for offline use — no console output needed in production.
  },
});

// One-time self-heal: older builds shipped a hand-rolled `/service-worker.js`
// that cached a stale app shell (and a non-existent /manifest.json), which left
// installed desktop apps showing a blank icon. Unregister that legacy worker and
// drop its caches so the vite-plugin-pwa worker (with correct icons) takes over.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => {
      if ((r.active?.scriptURL || '').endsWith('/service-worker.js')) {
        r.unregister();
      }
    });
  }).catch(() => undefined);
  if ('caches' in window) {
    caches.keys().then((keys) =>
      keys.filter((k) => k.startsWith('flowops-v')).forEach((k) => caches.delete(k)),
    ).catch(() => undefined);
  }
}

initSentry();
initObservatory();
initIntegrityTripwire();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ObservatoryErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <TenantProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
      </ObservatoryErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
