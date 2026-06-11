import { useState } from 'react';
import { LogOut, RefreshCw, Download, Wifi, WifiOff, Navigation, Truck } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface DashboardHeaderProps {
  driver: any;
  online: boolean;
  gpsActive: boolean;
  onLogout: () => void;
  onRefresh: () => void;
}

export default function DashboardHeader({ driver, online, gpsActive, onLogout, onRefresh }: DashboardHeaderProps) {
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [logoLoaded, setLogoLoaded] = useState(false);

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (installed) {
      console.log('✅ App installed successfully');
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 safe-area-top">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur overflow-hidden">
            {/* Logo with fade-in */}
            <div className={`transition-opacity duration-500 ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}>
              <img 
                src="/logos/flowops-logo-96.png" 
                alt="FlowOps" 
                className="w-10 h-10 object-contain"
                onLoad={() => setLogoLoaded(true)}
                onError={() => setLogoLoaded(true)}
              />
            </div>
            {/* Fallback while loading */}
            {!logoLoaded && (
              <Truck className="w-6 h-6 text-white animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">FlowOps Driver</h1>
            <p className="text-sm text-blue-100">{driver.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isInstallable && (
            <button
              onClick={handleInstall}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg animate-pulse"
              title="Install App"
            >
              <Download className="w-4 h-4" />
              Install
            </button>
          )}
          
          <button
            onClick={onRefresh}
            className={`p-2 rounded-lg transition-colors ${
              gpsActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            }`}
            title="GPS Status"
          >
            <Navigation className="w-5 h-5" />
          </button>
          
          <div className={`p-2 rounded-lg ${online ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
            {online ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>
          
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          <button
            onClick={onLogout}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
