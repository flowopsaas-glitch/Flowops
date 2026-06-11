import React, { useState, useEffect } from 'react';
import { Layers, Plus, Search, FileText, Eye, Loader2 } from "lucide-react";
import axios from 'axios';

const FLOWOPS_API_URL = 'http://localhost:3000/api/v1';

export default function ManifestsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(' ManifestsPage: useEffect triggered');
    
    const fetchManifests = async () => {
      try {
        console.log('📦 ManifestsPage: Starting fetch...');
        const token = localStorage.getItem('access_token');
        console.log(' ManifestsPage: Token exists?', !!token);
        
        const url = `${FLOWOPS_API_URL}/manifests`;
        console.log('📦 ManifestsPage: Fetching from:', url);
        
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('📦 ManifestsPage: Response received:', res.data);
        setManifests(res.data);
        setError(null);
      } catch (err: any) {
        console.error('📦 ManifestsPage: Fetch failed!', err);
        setError(err.message || 'Unknown error');
      } finally {
        console.log(' ManifestsPage: Setting loading=false');
        setLoading(false);
      }
    };

    fetchManifests();
  }, []);

  const filteredManifests = manifests.filter(m => 
    m.manifestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.destination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-[#020813] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <span className="ml-3 text-white/70 font-mono text-sm">Fetching global sector load sheets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 min-h-screen bg-[#020813] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-red-400 font-bold text-lg mb-2">Failed to Load Manifests</h3>
          <p className="text-white/60 font-mono text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 font-mono text-slate-100 min-h-screen bg-[#020813]">
      {/* Dynamic Command Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-wider flex items-center gap-2">
            <Layers className="text-sky-400" size={24} /> Manifests Control
          </h1>
          <p className="text-white/50 text-xs mt-1">Driver delivery & fleet collection orchestration panels</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input 
              type="text" 
              placeholder="Search manifest, destination..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-4 pr-10 text-xs focus:outline-none focus:border-sky-500/50 text-white transition-all placeholder:text-white/20"
            />
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
          </div>
          
          <button className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(2,132,199,0.3)] shrink-0">
            <Plus size={14} /> Create Manifest
          </button>
        </div>
      </div>

      {/* Empty State Fallback */}
      {filteredManifests.length === 0 ? (
        <div className="bg-[#040d1a] border border-white/5 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
          <div className="bg-white/5 p-4 rounded-full mb-4 border border-white/10">
            <Layers className="text-white/20" size={32} />
          </div>
          <h3 className="text-md font-bold text-white uppercase tracking-wider">No Active Manifest Matches</h3>
          <p className="text-white/40 text-xs max-w-xs mt-2 leading-relaxed">
            Ready to assist with logistics updates. Create a new driver manifest sheet to begin sector monitoring.
          </p>
        </div>
      ) : (
        /* Operational Active Roster Data Table Grid */
        <div className="border border-white/10 bg-black/30 rounded-2xl overflow-hidden backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-sky-950/20 border-b border-white/10 text-sky-400 font-black tracking-widest uppercase text-[10px]">
                  <th className="p-4">Manifest Tracking ID</th>
                  <th className="p-4">Destination Sector</th>
                  <th className="p-4">Waybill Count</th>
                  <th className="p-4">Operational Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredManifests.map((mnf) => (
                  <tr key={mnf.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 font-bold text-white flex items-center gap-2.5">
                      <FileText size={14} className="text-sky-500/50" />
                      {mnf.manifestNumber}
                    </td>
                    <td className="p-4 text-white/80">{mnf.destination || 'N/A'}</td>
                    <td className="p-4 text-white/80">{mnf.waybills?.length || 0} units</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        mnf.status === 'OPEN' ? 'bg-sky-500/20 text-sky-400' : 
                        mnf.status === 'CLOSED' ? 'bg-green-500/20 text-green-400' : 
                        'bg-white/10 text-white/60'
                      }`}>
                        {mnf.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button className="text-sky-400 hover:text-white transition-colors">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
