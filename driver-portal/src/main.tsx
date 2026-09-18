import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { startSyncEngine } from './services/syncEngine';
import './index.css';

registerSW({ immediate: true });

// Drain any offline-queued POD / collection actions as soon as the app boots
// and whenever connectivity returns — nothing captured in a dead zone is lost.
startSyncEngine();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
