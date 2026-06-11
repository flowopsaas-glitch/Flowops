import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Truck, Package, AlertCircle, RefreshCw, MessageSquare, Send, Zap, User, CheckCircle, X, ClipboardList } from 'lucide-react';
import { api } from '../../../api/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

type Tab = 'dispatch' | 'whatsapp';

export const DispatcherConsole: React.FC = () => {
  const [tab, setTab] = useState<Tab>('dispatch');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp state
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [bridgedSet, setBridgedSet] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const headers = { Authorization: `Bearer ${token}` };
      const results = await Promise.allSettled([
        axios.get(`${API_URL}/drivers`, { headers }),
        axios.get(`${API_URL}/manifests`, { headers }),
      ]);
      setDrivers(results[0].status === 'fulfilled' ? (results[0].value.data || []) : []);
      setManifests(results[1].status === 'fulfilled' ? (results[1].value.data || []) : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dispatch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchThreads = async () => {
    try {
      const res: any = await api.get('/whatsapp/threads');
      const list = Array.isArray(res) ? res : (res?.data || []);
      setThreads(list);
      if (list.length > 0 && !selectedPhone) setSelectedPhone(list[0].phone);
    } catch (e) { console.error('WhatsApp threads failed', e); }
  };

  const fetchMessages = async (phone: string) => {
    try {
      const res: any = await api.get(`/whatsapp/messages/${phone}`);
      const list = Array.isArray(res) ? res : (res?.data || []);
      setMessages(list);
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
    } catch (e) { console.error('Messages failed', e); }
  };

  useEffect(() => { fetchData(); fetchThreads(); }, []);
  useEffect(() => { if (selectedPhone) fetchMessages(selectedPhone); }, [selectedPhone]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone) return;
    setSendingMsg(true);
    try {
      await api.post('/whatsapp/send', { to: selectedPhone, message: newMessage });
      setNewMessage('');
      fetchMessages(selectedPhone);
    } catch (e) { console.error(e); }
    setSendingMsg(false);
  };

  const handleBridge = async (msg: any, i: number) => {
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      if (msg.mediaUrl) {
        const res = await fetch(msg.mediaUrl);
        const blob = await res.blob();
        formData.append('file', blob, `wa_${Date.now()}.jpg`);
      } else {
        const blob = new Blob([JSON.stringify({ content: msg.body, from: msg.from || selectedPhone })], { type: 'application/json' });
        formData.append('file', blob, `collection_request_${Date.now()}.json`);
      }
      await fetch(`${API_URL}/waybills/inbox/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      setBridgedSet(prev => new Set(prev).add(i));
    } catch (e) { console.error('Bridge failed', e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-[#0f172a]" style={{ minHeight: '100%' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading Dispatch Console...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-[#0f172a] p-8" style={{ minHeight: '100%' }}>
        <div className="bg-[#1e293b] p-6 rounded-lg border border-red-500/30 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Error</h3>
          <p className="text-slate-300 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const openManifests = manifests.filter((m: any) => m?.status === 'OPEN' || !m?.status);
  const availableDrivers = drivers.filter((d: any) => d?.status === 'AVAILABLE');
  const busyDrivers = drivers.filter((d: any) => d?.status === 'BUSY');
  const driverThreads = threads.filter((t: any) => t.role === 'DRIVER');
  const clientThreads = threads.filter((t: any) => t.role !== 'DRIVER');
  const unreadCount = threads.filter((t: any) => t.unread > 0).length;

  return (
    <div className="flex flex-col bg-[#0f172a] text-white" style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-slate-700 p-4 flex justify-between items-center shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-400" />
          Dispatch Command Center
        </h1>
        <div className="flex gap-3">
          {/* Tabs */}
          <button onClick={() => setTab('dispatch')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all ${tab === 'dispatch' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            <Truck className="w-3.5 h-3.5" /> Dispatch
          </button>
          <button onClick={() => setTab('whatsapp')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all ${tab === 'whatsapp' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp Hub
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{unreadCount}</span>
            )}
          </button>
          <button onClick={() => { fetchData(); fetchThreads(); }}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-sm flex items-center gap-2">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <div className="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {availableDrivers.length} Available
          </div>
          <div className="px-3 py-1 bg-yellow-900/30 text-yellow-400 rounded-full text-sm flex items-center gap-2">
            <Package className="w-3 h-3" /> {openManifests.length} Manifests
          </div>
        </div>
      </div>

      {/* ── DISPATCH TAB ── */}
      {tab === 'dispatch' && (
        <div className="flex-1 flex" style={{ minHeight: '600px' }}>
          {/* Left Panel */}
          <div className="w-96 bg-[#1e293b] border-r border-slate-700 overflow-y-auto shrink-0">
            <div className="p-4 space-y-6">
              <div>
                <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-200"><Package className="w-4 h-4 text-blue-400" /> Open Manifests</h2>
                <div className="space-y-2">
                  {openManifests.map((m: any, i: number) => (
                    <div key={m.id || i} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-slate-200">{m.manifestNumber || `MAN-${m.id || i}`}</div>
                          <div className="text-xs text-slate-400 mt-1">{m.destination || 'Unknown Destination'}</div>
                        </div>
                        <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">{m.waybillCount || 0} WB</span>
                      </div>
                    </div>
                  ))}
                  {openManifests.length === 0 && <div className="text-center text-slate-500 py-8 text-sm">No open manifests</div>}
                </div>
              </div>
              <div>
                <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-200"><Truck className="w-4 h-4 text-blue-400" /> Available Drivers</h2>
                <div className="space-y-2">
                  {availableDrivers.map((d: any, i: number) => (
                    <div key={d.id || i} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-slate-200">{d.name || `Driver #${d.id}`}</div>
                          <div className="text-xs text-slate-400">{d.phone || 'No phone'}</div>
                        </div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      </div>
                    </div>
                  ))}
                  {availableDrivers.length === 0 && <div className="text-center text-slate-500 py-8 text-sm">No available drivers</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Fleet Status */}
          <div className="flex-1 relative bg-slate-900 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <Truck className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Live Fleet Map</p>
              <p className="text-sm mt-2">See Fleet Map section for GPS tracking</p>
            </div>
            <div className="absolute top-4 right-4 bg-[#1e293b]/90 backdrop-blur-sm p-4 rounded-lg border border-slate-700 shadow-xl">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Fleet Status</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{availableDrivers.length}</div>
                  <div className="text-xs text-slate-400 mt-1">Available</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{busyDrivers.length}</div>
                  <div className="text-xs text-slate-400 mt-1">On Route</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── WHATSAPP HUB TAB ── */}
      {tab === 'whatsapp' && (
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: '600px' }}>
          {/* Sidebar: Contact List */}
          <div className="w-80 bg-[#1e293b] border-r border-slate-700 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-400" /> Flow-Comm
              </h2>
              <p className="text-xs text-slate-400 mt-1">Collection requests, POC, POD</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Driver Threads */}
              {driverThreads.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Truck className="w-3 h-3" /> Drivers</p>
                  {driverThreads.map(t => (
                    <ContactTile key={t.id || t.phone} t={t} active={selectedPhone === t.phone} onClick={() => setSelectedPhone(t.phone)} />
                  ))}
                </div>
              )}
              {/* Client Threads */}
              {clientThreads.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Clients</p>
                  {clientThreads.map(t => (
                    <ContactTile key={t.id || t.phone} t={t} active={selectedPhone === t.phone} onClick={() => setSelectedPhone(t.phone)} />
                  ))}
                </div>
              )}
              {threads.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No WhatsApp conversations yet.</p>
                  <p className="text-slate-600 text-xs mt-1">Messages from clients & drivers appear here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1 flex flex-col bg-slate-900/50">
            {selectedPhone ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-700 bg-[#1e293b]/80 backdrop-blur-md">
                  <h3 className="font-bold text-white">{threads.find(t => t.phone === selectedPhone)?.name || selectedPhone}</h3>
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider">Live Chat</p>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.map((msg: any, i: number) => {
                    const isOutbound = msg.direction === 'outbound' || msg.fromMe;
                    const isBridged = bridgedSet.has(i);
                    const isCollectionRequest = msg.body?.toLowerCase().includes('collection') || msg.body?.toLowerCase().includes('pickup') || msg.body?.toLowerCase().includes('collect');
                    return (
                      <div key={i} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-2xl p-3 ${isOutbound ? 'bg-green-700/80 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'}`}>
                          {msg.mediaUrl && <img src={msg.mediaUrl} alt="media" className="rounded-lg mb-2 max-h-40 object-cover w-full" />}
                          <p className="text-sm leading-relaxed">{msg.body}</p>
                          <p className="text-[10px] opacity-60 mt-1">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</p>

                          {/* Action buttons for inbound messages */}
                          {!isOutbound && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {isCollectionRequest && !isBridged && (
                                <button onClick={() => handleBridge(msg, i)}
                                  className="flex items-center gap-1 px-2 py-1 bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-lg text-[10px] font-bold hover:bg-blue-600/50 transition-all">
                                  <ClipboardList className="w-3 h-3" /> Create Collection
                                </button>
                              )}
                              {isBridged && (
                                <span className="flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-400 rounded-lg text-[10px] font-bold">
                                  <CheckCircle className="w-3 h-3" /> Sent to Inbox
                                </span>
                              )}
                              {(msg.body?.toLowerCase().includes('pod') || msg.body?.toLowerCase().includes('delivered')) && (
                                <span className="flex items-center gap-1 px-2 py-1 bg-purple-900/30 text-purple-300 rounded-lg text-[10px] font-bold border border-purple-700/40">
                                  POD Notification
                                </span>
                              )}
                              {(msg.body?.toLowerCase().includes('poc') || msg.body?.toLowerCase().includes('picked up') || msg.body?.toLowerCase().includes('collected')) && (
                                <span className="flex items-center gap-1 px-2 py-1 bg-amber-900/30 text-amber-300 rounded-lg text-[10px] font-bold border border-amber-700/40">
                                  POC Notification
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No messages yet</p>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-slate-700 bg-[#1e293b]/80 backdrop-blur-md">
                  <div className="flex gap-3">
                    <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleSend()}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 outline-none focus:border-green-500" />
                    <button onClick={handleSend} disabled={!newMessage.trim() || sendingMsg}
                      className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl transition-all flex items-center gap-2 text-sm font-semibold">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-slate-500">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">Select a conversation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function ContactTile({ t, active, onClick }: { t: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-3 rounded-xl transition-all mb-1.5 ${active ? 'bg-slate-700 border border-green-500/40' : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/60'}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {(t.name || t.phone || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-200 text-sm truncate">{t.name || t.phone}</div>
          <div className="text-xs text-slate-500 truncate">{t.lastMessage || 'No messages yet'}</div>
        </div>
        {t.unread > 0 && <span className="bg-green-500 text-white text-[10px] rounded-full px-1.5 py-0.5 shrink-0">{t.unread}</span>}
      </div>
    </button>
  );
}
