import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Navigation, FileText } from 'lucide-react';
import AdminDashboard from '@/components/analytics/AdminDashboard';
import DispatcherDashboard from '@/components/analytics/DispatcherDashboard';
import ReportsDashboard from '@/components/analytics/ReportsDashboard';
import AiChat from '@/components/analytics/AiChat';

type DashboardView = 'admin' | 'dispatcher' | 'reports';

export default function Analytics() {
  const [view, setView] = useState<DashboardView>('admin');
  const [userRole, setUserRole] = useState<string>('ADMIN');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setUserRole(user.role || 'ADMIN');
        if (user.role === 'DISPATCHER') {
          setView('dispatcher');
        }
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  const viewDescriptions = {
    admin: 'Strategic insights and financial metrics for your courier company',
    dispatcher: 'Real-time operational metrics and performance',
    reports: 'Generate and share professional PDF reports',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="text-blue-400" />
            Advanced Analytics
          </h1>
          <p className="text-gray-400 mt-1">{viewDescriptions[view]}</p>
        </div>

        {/* View Switcher */}
        <div className="flex gap-2 bg-gray-900 rounded-xl shadow-lg p-1 border border-gray-800">
          <button
            onClick={() => setView('admin')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              view === 'admin'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Admin View
          </button>
          <button
            onClick={() => setView('dispatcher')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              view === 'dispatcher'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Navigation className="w-4 h-4" />
            Dispatcher View
          </button>
          <button
            onClick={() => setView('reports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              view === 'reports'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Reports
          </button>
        </div>
      </div>

      {/* Dashboard Content */}
      {view === 'admin' && <AdminDashboard />}
      {view === 'dispatcher' && <DispatcherDashboard />}
      {view === 'reports' && <ReportsDashboard />}

      {/* AI Chat Floating Button */}
      <AiChat />
    </div>
  );
}
