import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, ScanLine, Package, Filter, MoreVertical } from 'lucide-react';
import { inventoryApi } from '../../lib/inventoryApi';

export default function ItemsCatalog() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    try {
      const res = await inventoryApi.getItems({ search });
      setItems(res.data);
    } catch (error) { console.error(error); }
  };

  const handleBarcodeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    setScanning(true);
    try {
      const res = await inventoryApi.getItemByBarcode(barcodeInput);
      setItems([res.data]);
      setBarcodeInput('');
    } catch (error: any) {
      alert('Item not found: ' + barcodeInput);
    } finally { setScanning(false); }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black">Item Catalog</h1>
          <p className="text-slate-400 text-sm">Manage SKUs, barcodes, and stock levels.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-700 transition">
            <Filter size={16} /> Filter
          </button>
          <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Barcode Scanner */}
      <motion.form 
        onSubmit={handleBarcodeScan}
        className="mb-8 bg-slate-900/50 backdrop-blur border border-white/10 rounded-2xl p-4 flex gap-2"
      >
        <div className="flex-1 relative">
          <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
          <input
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="Scan barcode or enter SKU to instantly locate item..."
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <button 
          type="submit" 
          disabled={scanning}
          className="px-6 bg-blue-600 rounded-xl font-bold text-sm hover:bg-blue-500 transition disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </motion.form>

      {/* Search & Items Grid */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); loadItems(); }}
          placeholder="Search items by name, SKU, or barcode..."
          className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.05 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:border-blue-500/30 transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <Package size={18} />
                </div>
                <button className="text-slate-500 hover:text-white">
                  <MoreVertical size={16} />
                </button>
              </div>
              <h3 className="font-bold mb-1 truncate">{item.name}</h3>
              <p className="text-xs text-slate-400 font-mono mb-3">{item.sku}</p>
              
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <div className="bg-black/20 rounded-lg p-2">
                  <p className="text-slate-500 mb-1">Cost</p>
                  <p className="font-bold">R {item.costPrice}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <p className="text-slate-500 mb-1">Sell</p>
                  <p className="font-bold text-emerald-400">R {item.sellPrice}</p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-white/5">
                <span className="text-xs text-slate-500 font-mono">{item.barcode || 'No Barcode'}</span>
                <span className="text-xs font-bold text-blue-400 group-hover:translate-x-1 transition-transform">
                  View Details →
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <Package className="mx-auto mb-4 opacity-20" size={48} />
          <p>No items found. Try scanning a barcode or adding a new item.</p>
        </div>
      )}
    </div>
  );
}
