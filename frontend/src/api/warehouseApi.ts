import api from './client';

export const getWmsDashboard = () => api.get('/wms/dashboard');
export const getWmsKpis = (days?: number) => api.get('/wms/kpis', { params: { days } });
export const getWmsAiInsights = () => api.get('/wms/ai-insights');
export const listWarehouses = () => api.get('/wms/warehouses');
export const createWarehouse = (data: Record<string, unknown>) => api.post('/wms/warehouses', data);
export const getWarehouse = (id: string) => api.get(`/wms/warehouses/${id}`);
export const createZone = (whId: string, data: Record<string, unknown>) => api.post(`/wms/warehouses/${whId}/zones`, data);
export const bulkCreateBins = (zoneId: string, data: Record<string, unknown>) => api.post(`/wms/zones/${zoneId}/bins/bulk`, data);
export const getInventory = (filters?: Record<string, unknown>) => api.get('/wms/inventory', { params: filters });
export const getInventorySummary = () => api.get('/wms/inventory/summary');
export const adjustStock = (data: Record<string, unknown>) => api.post('/wms/inventory/adjust', data);
export const transferStock = (data: Record<string, unknown>) => api.post('/wms/inventory/transfer', data);
export const suggestPutAway = (sku: string, qty: number) =>
  api.get('/wms/ai/put-away-suggestion', { params: { sku, quantity: qty } });
export const getReplenishment = () => api.get('/wms/ai/replenishment');
export const createReceipt = (data: Record<string, unknown>) => api.post('/wms/receipts', data);
export const receiveGoods = (id: string, data: Record<string, unknown>) => api.post(`/wms/receipts/${id}/receive`, data);
export const createPickOrder = (data: Record<string, unknown>) => api.post('/wms/picks', data);
export const confirmPick = (id: string, data: Record<string, unknown>) => api.post(`/wms/picks/${id}/confirm`, data);
export const createCycleCount = (data: Record<string, unknown>) => api.post('/wms/counts', data);
export const submitCycleCount = (id: string, data: Record<string, unknown>) => api.post(`/wms/counts/${id}/submit`, data);
export const approveCycleCount = (id: string) => api.post(`/wms/counts/${id}/approve`);
export const getMovements = (filters?: Record<string, unknown>) => api.get('/wms/movements', { params: filters });



// ── World-Class WMS Operations (PR #338 endpoints) ───────────────────────
export const createCrossDock = (data: Record<string, unknown>) => api.post('/wms/cross-dock', data);
export const createWave = (data: Record<string, unknown>) => api.post('/wms/waves', data);
export const getSlotting = (warehouseId: string) => api.get(`/wms/slotting/${warehouseId}`);
export const verifyScan = (data: Record<string, unknown>) => api.post('/wms/scan/verify', data);
