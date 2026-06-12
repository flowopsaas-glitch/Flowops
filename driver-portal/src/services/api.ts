import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const driverApi = {
  login: (phone: string, pin: string) => api.post('/driver-portal/login', { phone, pin }),
  getDeliveries: (driverId: number) => api.get(`/driver-portal/deliveries/${driverId}`),
  // ✅ Collections (pickups assigned to this driver)
  getCollections: (driverId: number) => api.get(`/driver-portal/collections/${driverId}`),
  updateGps: (driverId: number, lat: number, lng: number, speed?: number) =>
    api.post('/driver-portal/gps', { driverId, lat, lng, speed }),
  // ✅ POD — Proof of Delivery (for waybills/deliveries)
  uploadPod: (data: any) => api.post('/driver-portal/pod', data),
  // ✅ POC — Proof of Collection (for collections/pickups)
  uploadPoc: (data: any) => api.post('/driver-portal/poc', data),

  // Chat
  getMessages: (driverId: number, limit = 50, skip = 0) =>
    api.get(`/driver-portal/chat/messages/${driverId}?limit=${limit}&skip=${skip}`),
  sendMessage: (driverId: number, message: string, attachmentUrl?: string, attachmentType?: string) =>
    api.post('/driver-portal/chat/send', { driverId, message, senderType: 'driver', attachmentUrl, attachmentType }),
  markAsRead: (driverId: number) =>
    api.patch(`/driver-portal/chat/read/${driverId}`, { readerType: 'driver' }),
  setTyping: (driverId: number, isTyping: boolean) =>
    api.post(`/driver-portal/chat/typing/${driverId}`, { isTyping }),
  getTypingStatus: (driverId: number) =>
    api.get(`/driver-portal/chat/typing/${driverId}`),
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export default api;
