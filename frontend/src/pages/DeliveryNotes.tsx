import { useState, useEffect, useCallback } from 'react';
import { StickyNote, Plus, Search, Filter, CheckCircle2, AlertTriangle, Clock, Loader2, Trash2 } from 'lucide-react';
import { listDeliveryNotes, createDeliveryNote, resolveDeliveryNote, deleteDeliveryNote, type DeliveryNote, type CreateNotePayload, type NotePriority } from '../api/deliveryNotesApi';
import { useToast } from '../components/ToastProvider';

export default function DeliveryNotes() {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<{ priority?: string; isResolved?: string }>({});
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CreateNotePayload>({ content: '', priority: 'NORMAL', category: 'GENERAL' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter.priority) params.priority = filter.priority;
      if (filter.isResolved) params.isResolved = filter.isResolved;
      const data = await listDeliveryNotes(params);
      setNotes(data);
    } catch (e: any) {
      showToast(e.message || 'Failed to load notes', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.content.trim()) { showToast('Note content is required', 'error'); return; }
    try {
      await createDeliveryNote(form);
      showToast('Note created successfully', 'success');
      setShowCreate(false);
      setForm({ content: '', priority: 'NORMAL', category: 'GENERAL' });
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveDeliveryNote(id);
      showToast('Note resolved', 'success');
      load();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeliveryNote(id);
      showToast('Note deleted', 'success');
      load();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const priorityStyle = (p: NotePriority) => {
    switch (p) {
      case 'URGENT': return 'border-red-500/50 bg-red-500/10 text-red-400';
      case 'HIGH': return 'border-orange-500/50 bg-orange-500/10 text-orange-400';
      case 'NORMAL': return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
      case 'LOW': return 'border-white/20 bg-white/5 text-white/50';
    }
  };

  const filteredNotes = notes.filter(n =>
    !search || n.content.toLowerCase().includes(search.toLowerCase()) || n.createdByName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30">
              <StickyNote className="w-6 h-6 text-amber-400" />
            </div>
            Delivery Notes
          </h1>
          <p className="text-sm text-white/50 mt-1">Dispatcher notes, instructions & issue tracking for deliveries</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 transition flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-500/50 outline-none text-sm"
            placeholder="Search notes..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm outline-none"
          value={filter.priority || ''} onChange={e => setFilter({ ...filter, priority: e.target.value || undefined })}
        >
          <option value="">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>
        <select
          className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm outline-none"
          value={filter.isResolved || ''} onChange={e => setFilter({ ...filter, isResolved: e.target.value || undefined })}
        >
          <option value="">All Status</option>
          <option value="false">Open</option>
          <option value="true">Resolved</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Total</p><p className="text-xl font-black text-white mt-1">{notes.length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Open</p><p className="text-xl font-black text-amber-400 mt-1">{notes.filter(n => !n.isResolved).length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Urgent</p><p className="text-xl font-black text-red-400 mt-1">{notes.filter(n => n.priority === 'URGENT').length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Resolved</p><p className="text-xl font-black text-emerald-400 mt-1">{notes.filter(n => n.isResolved).length}</p></div>
      </div>

      {/* Notes List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <StickyNote className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/50">No delivery notes found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => (
            <div key={note.id} className={`rounded-2xl border bg-white/[0.03] p-5 transition ${note.isResolved ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${priorityStyle(note.priority)}`}>{note.priority}</span>
                    {note.category && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/5 text-white/40 border border-white/10">{note.category}</span>}
                    {note.isResolved && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-white text-sm">{note.content}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
                    <span>{note.createdByName || 'Unknown'}</span>
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                    {note.waybillId && <span className="text-blue-400">WB: {note.waybillId.slice(0, 10)}...</span>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {!note.isResolved && (
                    <button onClick={() => handleResolve(note.id)} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition" title="Resolve">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(note.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Add Delivery Note</h2>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-500/50 outline-none resize-none"
              placeholder="Note content..."
              rows={4}
              value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <select className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 outline-none" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as NotePriority })}>
                <option value="LOW">Low Priority</option>
                <option value="NORMAL">Normal Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="URGENT">Urgent</option>
              </select>
              <select className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 outline-none" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value as any })}>
                <option value="GENERAL">General</option>
                <option value="INSTRUCTION">Instruction</option>
                <option value="ISSUE">Issue</option>
                <option value="UPDATE">Update</option>
              </select>
            </div>
            <input
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-500/50 outline-none"
              placeholder="Waybill ID (optional)"
              value={form.waybillId || ''} onChange={e => setForm({ ...form, waybillId: e.target.value || undefined })}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500">Add Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
