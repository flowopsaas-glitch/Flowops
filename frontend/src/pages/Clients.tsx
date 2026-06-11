import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/ToastProvider';

export default function Clients() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', subscriptionPlan: 'CONTRACT', email: '' })

  async function fetchItems() {
    setLoading(true)
    try {
      // CHANGED: Removed /v2/ to match your backend's verified RoutesResolver logs
      const res = await fetch('http://localhost:3000/api/companies')
      const rawData = await res.json()
      setItems(Array.isArray(rawData) ? rawData : (rawData?.data || []))
    } catch (err) {
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = editingId 
        ? `http://localhost:3000/api/companies/${editingId}` 
        : 'http://localhost:3000/api/companies';
      const method = editingId ? 'PATCH' : 'POST';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      closeForm();
      fetchItems();
    } catch (err) {
      console.error("Save error:", err)
    } finally {
      setLoading(false)
    }
  }

  const { showToast } = useToast();

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this client?")) return;
    try {
      await fetch(`http://localhost:3000/api/companies/${id}`, { method: 'DELETE' });
      fetchItems();
      showToast('Client deleted successfully.', 'success');
    } catch (err) {
      showToast("Failed to delete client.", "error");
    }
  }

  const openEdit = (client: any) => {
    setFormData({ 
      name: client.name || '', 
      subscriptionPlan: client.subscriptionPlan || 'CONTRACT', 
      email: client.email || '' 
    });
    setEditingId(client.id);
    setIsFormOpen(true);
  }

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({ name: '', subscriptionPlan: 'CONTRACT', email: '' });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => String(item?.name ?? '').toLowerCase().includes(q))
  }, [items, search])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-sky-200">Clients</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {isFormOpen ? (editingId ? 'Edit Client' : 'New Registration') : 'Client directory'}
          </h1>
        </div>
        <button onClick={isFormOpen ? closeForm : () => setIsFormOpen(true)} className="rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-400">
          {isFormOpen ? 'Cancel' : '+ New Client'}
        </button>
      </div>

      {!isFormOpen ? (
        <>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none" />
          </div>
          <div className="grid gap-4">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-white/10 bg-white/5 p-5 flex justify-between items-center group">
                <div>
                  <div className="text-lg font-medium text-white">{item.name}</div>
                  <div className="text-xs text-slate-500">ID: {item.id}</div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(item)} className="px-4 py-2 bg-slate-800 text-sky-400 rounded-xl text-sm font-bold">Edit</button>
                  <button onClick={() => handleDelete(item.id)} className="px-4 py-2 bg-slate-800 text-rose-400 rounded-xl text-sm font-bold">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={handleSave} className="rounded-[28px] border border-sky-400/30 bg-white/5 p-8 backdrop-blur-xl">
          <div className="grid gap-6">
            <input required placeholder="Company Name" className="w-full rounded-xl border border-white/10 bg-slate-900/70 p-3 text-white"
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            <select className="w-full rounded-xl border border-white/10 bg-slate-900/70 p-3 text-white"
              value={formData.subscriptionPlan} onChange={e => setFormData({...formData, subscriptionPlan: e.target.value})}>
              <option value="CONTRACT">CONTRACT</option>
              <option value="PREPAID">PREPAID</option>
            </select>
            <button type="submit" className="rounded-2xl bg-sky-500 py-4 font-bold text-white hover:bg-sky-400">
              {loading ? 'Processing...' : 'Save Client'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
