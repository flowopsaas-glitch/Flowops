import axios from 'axios';

const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || "http://localhost:3000/api/v1";

const api = axios.create({
  baseURL: `${API_BASE}/inventory`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const inventoryApi = {
  getMetrics: () => api.get('/metrics'),
  getWarehouses: () => api.get('/warehouses'),
  getItems: (params?: { search?: string; categoryId?: number }) => api.get('/items', { params }),
  getItemByBarcode: (barcode: string) => api.get(`/items/barcode/${barcode}`),
  getMovements: (params?: { type?: string; limit?: number }) => api.get('/movements', { params }),
  getAlerts: (unreadOnly?: boolean) => api.get('/alerts', { params: { unreadOnly } }),
  
  // Mutations
  createWarehouse: (data: any) => api.post('/warehouses', data),
  createItem: (data: any) => api.post('/items', data),
  recordMovement: (data: any) => api.post('/movements', data),
  markAlertRead: (id: number) => api.patch(`/alerts/${id}/read`),
};
