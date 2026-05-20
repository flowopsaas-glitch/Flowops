import React, { useState } from 'react';
import { Layers, Plus, Search, FileText, Truck, Eye, ArrowUpRight, CheckCircle2 } from "lucide-react";

export default function ManifestsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Real-world South African (ZAR) fleet simulation context tracking structures
  const [manifests, setManifests] = useState([
    { id: 'MNF-2026-8901', driver: 'Sibusiso Dlamini', route: 'Johannesburg Core ➔ Soweto East', items: 18, weight: '450kg', status: 'IN_TRANSIT' },
    { id: 'MNF-2026-8902', driver: 'Johan Pretorius', route: 'Pretoria Hub ➔ Midrand Industrial', items: 34, weight: '1,200kg', status: 'COMPLETED' },
    { id: 'MNF-2026-8903', driver: 'Thabo Mokoena', route: 'Eldorado Park ➔ Lenasia Sector', items: 12, weight: '210kg', status: 'PENDING' }
  ]);

  const filteredManifests = manifests.filter(m => 
    m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.route.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              placeholder="Search driver, manifest, route..."
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

      {/* Empty State Fallback Evaluation Pass */}
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
                  <th className="p-4">Assigned Unit Driver</th>
                  <th className="p-4">Sector Route Map Trajectory</th>
                  <th className="p-4 text-center">Load Capacity</th>
                  <th className="p-4">Operational Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredManifests.map((mnf) => (
                  <tr key={mnf.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 font-bold text-white flex items-center gap-2.5">
                      <FileText size={14} className="text-sky-500/50" />
                      {mnf.id}
                    </td>
                    <td className="p-4 text-slate-200 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {mnf.driver}
                      </div>
                    </td>
                    <td className="p-4 text-slate-400 max-w-xs truncate">{mnf.route}</td>
                    <td className="p-4 text-center text-slate-300">
                      <span className="font-bold text-sky-400">{mnf.items}</span> parcels <span className="text-white/30">|</span> <span className="text-slate-400">{mnf.weight}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md font-black text-[9px] tracking-wider border ${
                        mnf.status === 'IN_TRANSIT' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                        mnf.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        'bg-slate-500/10 border-slate-500/30 text-slate-400'
                      }`}>
                        {mnf.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button className="p-1.5 border border-white/10 bg-white/5 hover:bg-sky-600 hover:text-white rounded-lg transition-all text-slate-400 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                        <Eye size={12} /> Audit
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

