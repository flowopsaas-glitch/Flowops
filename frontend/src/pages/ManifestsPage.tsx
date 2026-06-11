import React, { useState, useEffect } from 'react';
import { Layers, Plus, Search, FileText, Eye, Loader2, X, Camera } from "lucide-react";
import axios from 'axios';
import BarcodeQrScanner from '@/components/BarcodeQrScanner';
import { io } from "socket.io-client";

const FLOWOPS_API_URL = 'http://localhost:3000/api/v1';

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedManifestId, setSelectedManifestId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ destination: '', notes: '' });

  useEffect(() => { 
    fetchManifests(); 
    
    // 🚀 WEBSOCKET REAL-TIME UPDATES
    const socket = io('http://localhost:3000');
    socket.on('manifest-updated', () => {
      console.log('🔄 Manifest updated via WebSocket');
      fetchManifests();
    });
    
    return () => { socket.disconnect(); };
  }, []);

  const fetchManifests = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${FLOWOPS_API_URL}/manifests`, { headers: { Authorization: `Bearer ${token}` } });
      setManifests(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // 📷 BARCODE SCANNER WIRING
  const handleScanResult = async (result: string) => {
    if (!selectedManifestId) return;
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${FLOWOPS_API_URL}/manifests/${selectedManifestId}/scan`, 
        { waybillNumber: result }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowScanner(false);
      alert(`Waybill ${result} scanned successfully!`);
      fetchManifests();
    } catch (err: any) {
      alert('Scan failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateManifest = async () => {
    if (!formData.destination.trim()) return;
    setCreating(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${FLOWOPS_API_URL}/manifests`, formData, { headers: { Authorization: `Bearer ${token}` } });
      setShowCreateModal(false);
      setFormData({ destination: '', notes: '' });
      fetchManifests();
    } catch (err: any) { alert('Failed: ' + err.message); } finally { setCreating(false); }
  };

  if (loading) return <div className="p-6 text-white">Loading...</div>;

  return (
    <div className="p-6 font-mono text-slate-100 min-h-screen bg-[#020813]">
      <div className="flex justify-between mb-8">
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><Layers className="text-sky-400" /> Manifests Control</h1>
        <button onClick={() => setShowCreateModal(true)} className="bg-sky-600 px-4 py-2 rounded-xl text-xs font-bold">+ CREATE MANIFEST</button>
      </div>

      <div className="border border-white/10 bg-black/30 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-sky-950/20 text-sky-400 uppercase">
            <tr><th className="p-4">ID</th><th className="p-4">Destination</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {manifests.map((m) => (
              <tr key={m.id} className="hover:bg-white/5">
                <td className="p-4 font-bold">{m.manifestNumber}</td>
                <td className="p-4">{m.destination}</td>
                <td className="p-4"><span className={`px-2 py-1 rounded ${m.status === 'CLOSED' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{m.status}</span></td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => { setSelectedManifestId(m.id); setShowScanner(true); }} className="text-sky-400 hover:text-sky-300"><Camera size={16} /></button>
                  <button className="text-white/50 hover:text-white"><Eye size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showScanner && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0f172a] p-6 rounded-2xl w-full max-w-md border border-white/10">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Scan Waybill</h3><button onClick={() => setShowScanner(false)}><X /></button></div>
            <BarcodeQrScanner onScan={handleScanResult} />
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0f172a] p-6 rounded-2xl w-full max-w-md border border-white/10">
            <h3 className="text-white font-bold mb-4">New Manifest</h3>
            <input placeholder="Destination" className="w-full bg-black/40 border border-white/10 p-2 rounded mb-2 text-white" value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} />
            <textarea placeholder="Notes" className="w-full bg-black/40 border border-white/10 p-2 rounded mb-4 text-white" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            <button onClick={handleCreateManifest} disabled={creating} className="w-full bg-sky-600 py-2 rounded text-white font-bold">{creating ? 'Creating...' : 'Create'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
