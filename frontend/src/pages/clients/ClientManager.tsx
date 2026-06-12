import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';

const ClientManager = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [clients, setClients] = useState([]);
  const [formData, setFormData] = useState({ name: '', subscriptionPlan: 'CONTRACT', email: '', phone: '' });

  const fetchClients = async () => {
    const res = await api.get<any, any>(`/companies`);
    setClients(res);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post<any, any>('/companies', formData);
    setIsFlipped(false);
    fetchClients();
  };

  return (
    <div className="p-6 transition-all duration-500 ease-in-out">
      {!isFlipped ? (
        /* LIST VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Client Directory</h2>
            <button 
              onClick={() => setIsFlipped(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold"
            >
              + Create Client Manually
            </button>
          </div>
          <div className="space-y-3">
            {clients.map((c: any) => (
              <div key={c.id} className="p-4 bg-slate-800 rounded border border-slate-700 flex justify-between">
                <div>
                  <span className="text-white font-medium">{c.name}</span>
                  <div className="text-xs text-slate-400">{c.subscriptionPlan}</div>
                </div>
                <span className="text-blue-400 text-sm">{c.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* CREATION FORM (The "Flip" Page) */
        <div className="bg-slate-900 border border-blue-500 rounded-xl p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
          <button onClick={() => setIsFlipped(false)} className="text-slate-400 hover:text-white mb-4">
            ← Back to Directory
          </button>
          <h2 className="text-2xl font-bold text-white mb-6">Register New Customer</h2>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="text-slate-400 text-sm">Customer / Company Name</label>
              <input required className="w-full bg-slate-800 p-3 rounded mt-1 text-white border border-slate-700"
                onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className="text-slate-400 text-sm">Billing Type</label>
              <select className="w-full bg-slate-800 p-3 rounded mt-1 text-white border border-slate-700"
                onChange={e => setFormData({...formData, subscriptionPlan: e.target.value})}>
                <option value="CONTRACT">CONTRACT (Invoice)</option>
                <option value="PREPAID">PREPAID (Wallet)</option>
                <option value="COD">COD (Cash on Delivery)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Contact Email</label>
              <input type="email" className="w-full bg-slate-800 p-3 rounded mt-1 text-white border border-slate-700"
                onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <button type="submit" className="col-span-2 bg-blue-600 py-4 rounded-xl font-bold text-lg hover:bg-blue-500 transition-colors">
              Confirm & Add to System
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ClientManager;