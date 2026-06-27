import { initSentry } from './lib/sentry';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { registerSW } from 'virtual:pwa-register';
import { initObservatory } from './lib/observatory';
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

initSentry();
initObservatory();

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
