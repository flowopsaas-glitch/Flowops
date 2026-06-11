import { useState, useEffect, Suspense, lazy } from 'react';
import { registerServiceWorker, requestNotificationPermission } from './services/notifications';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DeliveryDetail = lazy(() => import('./pages/DeliveryDetail'));
const Chat = lazy(() => import('./pages/Chat')); // Import Chat

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-white text-xl animate-pulse">Loading FlowOps...</div>
    </div>
  );
}

function App() {
  const [driver, setDriver] = useState<any>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null);
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard'); // New view state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('driver');
    if (saved) {
      try {
        setDriver(JSON.parse(saved));
      } catch {}
    }
    registerServiceWorker();
    requestNotificationPermission();
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('driver');
    setDriver(null);
    setSelectedDelivery(null);
  };

  if (loading) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      {!driver ? (
        <Login onLogin={setDriver} />
      ) : selectedDelivery ? (
        <DeliveryDetail
          waybill={selectedDelivery}
          driver={driver}
          onBack={() => setSelectedDelivery(null)}
          onComplete={() => setSelectedDelivery(null)}
        />
      ) : view === 'chat' ? (
        <Chat driver={driver} onBack={() => setView('dashboard')} />
      ) : (
        <>
          <Dashboard
            driver={driver}
            onLogout={handleLogout}
            onSelectDelivery={setSelectedDelivery}
          />
          {/* Floating Chat Button */}
          <button
            onClick={() => setView('chat')}
            className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl z-50 flex items-center gap-2 transition-transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="font-bold pr-2">Messages</span>
          </button>
        </>
      )}
    </Suspense>
  );
}

export default App;
