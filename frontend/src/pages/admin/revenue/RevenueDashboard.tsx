import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

const RevenueDashboard = () => {
  const [metrics, setMetrics] = useState({ outstanding: 0, collected: 0, collectionRate: 0 });
  const [highRisk, setHighRisk] = useState([]);

  useEffect(() => {
    // Fetch metrics from the mapped endpoint
    axios.get('/api/invoices/metrics').then(res => setMetrics(res.data));
    // Fetch overdue invoices (filtering UNPAID + past due date)
    axios.get('/api/invoices?status=UNPAID&overdue=true').then(res => setHighRisk(res.data));
  }, []);

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-200">
      <h1 className="text-2xl font-bold mb-6">Revenue & Credit Control</h1>

      {/* --- METRIC CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard 
          title="Total Collected" 
          value={`R ${metrics.collected.toLocaleString()}`} 
          icon={<CheckCircle className="text-emerald-400" />} 
          trend="+12% vs last month"
        />
        <StatCard 
          title="Outstanding" 
          value={`R ${metrics.outstanding.toLocaleString()}`} 
          icon={<Clock className="text-amber-400" />} 
          trend={`${highRisk.length} invoices overdue`}
        />
        <StatCard 
          title="Collection Rate" 
          value={`${metrics.collectionRate.toFixed(1)}%`} 
          icon={<TrendingUp className="text-blue-400" />} 
          trend="Target: 95%"
        />
      </div>

      {/* --- REVENUE CHART --- */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl mb-8">
        <h2 className="text-lg font-semibold mb-4">Revenue Flow (Last 30 Days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: 'Revenue', collected: metrics.collected, outstanding: metrics.outstanding }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
              <Bar dataKey="collected" fill="#10b981" radius={[4, 4, 0, 0]} name="Collected (ZAR)" />
              <Bar dataKey="outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Outstanding (ZAR)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- HIGH RISK QUEUE --- */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="font-semibold flex items-center gap-2">
            <AlertCircle size={18} className="text-rose-500" />
            High-Risk Unpaid Invoices
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400">
            <tr>
              <th className="p-4">Invoice #</th>
              <th className="p-4">Client</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Due Date</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {highRisk.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-4 font-mono text-blue-400">{inv.invoiceNumber}</td>
                <td className="p-4 font-medium">{inv.clientName}</td>
                <td className="p-4">R {inv.total.toFixed(2)}</td>
                <td className="p-4 text-rose-400">{new Date(inv.dueDate).toLocaleDateString()}</td>
                <td className="p-4">
                  <button className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-all">
                    Send Reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
    <div className="flex justify-between items-start mb-2">
      <span className="text-slate-400 text-sm font-medium">{title}</span>
      {icon}
    </div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-slate-500 mt-2">{trend}</div>
  </div>
);

export default RevenueDashboard;
