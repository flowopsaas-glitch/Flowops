import { initSentry } from './lib/sentry';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './contexts/AuthContext';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('A critical FlowOps system update is ready. Reload to sync all devices?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("FlowOps is ready for offline use.");
  },
});

initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
