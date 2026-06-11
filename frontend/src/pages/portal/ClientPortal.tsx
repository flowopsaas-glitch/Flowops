import React, { useState, useEffect } from 'react';
import { Package, FileText, Search, LogOut, Truck, CheckCircle, Clock, XCircle } from 'lucide-react';

interface Client {
  id: number;
  name: string;
  email: string;
  company: string;
}

interface Waybill {
  id: number;
  waybillNumber: string;
  status: string;
  origin: string;
  destination: string;
  recipient: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string;
}

export default function ClientPortal() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('clientToken'));
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'shipments' | 'invoices' | 'track'>('shipments');
  
  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Data state
  const [shipments, setShipments] = useState<Waybill[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [trackNumber, setTrackNumber] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);

  useEffect(() => {
    if (token) {
      fetchClientData();
    }
  }, [token]);

  const fetchClientData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch client profile
      const payload = JSON.parse(atob(token.split('.')[1]));
      setClient({ id: payload.clientId, name: payload.name || 'Client', email: payload.email, company: payload.company || 'Company' });

      // Fetch shipments
      const shipmentsRes = await fetch('http://localhost:3000/api/v1/client-portal/shipments', { headers });
      if (shipmentsRes.ok) {
        const data = await shipmentsRes.json();
        setShipments(data);
      }

      // Fetch invoices
      const invoicesRes = await fetch('http://localhost:3000/api/v1/client-portal/invoices', { headers });
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error('Failed to fetch client data:', err);
      handleLogout();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:3000/api/v1/client-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      setToken(data.token);
      setClient(data.client);
      localStorage.setItem('clientToken', data.token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setClient(null);
    localStorage.removeItem('clientToken');
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackNumber.trim()) return;

    try {
      const res = await fetch(`http://localhost:3000/api/v1/client-portal/track/${trackNumber}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingResult(data);
      } else {
        setTrackingResult({ error: 'Waybill not found' });
      }
    } catch (err) {
      setTrackingResult({ error: 'Tracking failed' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DELIVERED': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'PENDING': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'FAILED': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Truck className="w-5 h-5 text-blue-500" />;
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">FlowOps Client Portal</h1>
            <p className="text-gray-400">Sign in to view your shipments and invoices</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="client@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Demo credentials: any email / any password</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">FlowOps Client Portal</h1>
            <p className="text-sm text-gray-400">Welcome, {client?.name} ({client?.company})</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-900/50 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('shipments')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'shipments'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              Shipments
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'invoices'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('track')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'track'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
              Track Shipment
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'shipments' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Your Shipments</h2>
            {shipments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No shipments found</p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800/50 text-left text-sm text-gray-400">
                    <tr>
                      <th className="px-6 py-4">Waybill #</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Origin</th>
                      <th className="px-6 py-4">Destination</th>
                      <th className="px-6 py-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {shipments.map((wb) => (
                      <tr key={wb.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-blue-400">{wb.waybillNumber}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(wb.status)}
                            <span className="text-sm">{wb.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-300">{wb.origin || 'N/A'}</td>
                        <td className="px-6 py-4 text-gray-300">{wb.destination || 'N/A'}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {new Date(wb.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Your Invoices</h2>
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No invoices found</p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800/50 text-left text-sm text-gray-400">
                    <tr>
                      <th className="px-6 py-4">Invoice #</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Due Date</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-blue-400">{inv.invoiceNumber}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            inv.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium">R {Number(inv.total).toFixed(2)}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={`http://localhost:3000/api/v1/billing-batches/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                          >
                            Download PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'track' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Track Your Shipment</h2>
            <form onSubmit={handleTrack} className="flex gap-3 mb-8">
              <input
                type="text"
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                placeholder="Enter waybill number (e.g., WB-TEST-001)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
              >
                Track
              </button>
            </form>

            {trackingResult && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                {trackingResult.error ? (
                  <div className="text-center text-red-400">
                    <XCircle className="w-12 h-12 mx-auto mb-4" />
                    <p>{trackingResult.error}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                      <div>
                        <p className="text-sm text-gray-400">Waybill Number</p>
                        <p className="text-xl font-bold text-blue-400">{trackingResult.waybillNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(trackingResult.status)}
                        <span className="text-lg font-medium">{trackingResult.status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-400">Origin</p>
                        <p className="font-medium">{trackingResult.origin}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Destination</p>
                        <p className="font-medium">{trackingResult.destination}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Recipient</p>
                        <p className="font-medium">{trackingResult.recipient}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Created</p>
                        <p className="font-medium">{new Date(trackingResult.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
