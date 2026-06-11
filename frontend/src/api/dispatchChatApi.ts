import api from './client';

export interface ChatDriver {
  id: number;
  name: string;
  phone: string;
  status: string;
  vehicleReg: string;
}

export interface ChatMessage {
  id: number;
  driverId: number;
  senderType: 'driver' | 'dispatch';
  senderId: number;
  message: string;
  createdAt: string;
  type: string;
  readAt: string | null;
  attachmentUrl?: string;
  attachmentType?: string;
}

export const dispatchChatApi = {
  getActiveDrivers: async (companyId?: number) => {
    const params = companyId ? { companyId } : {};
    const response = await api.get('/dispatch-chat/drivers', { params });
    return response as any;
  },

  getMessages: async (driverId: number, limit = 50, skip = 0) => {
    const response = await api.get(`/driver-portal/chat/messages/${driverId}?limit=${limit}&skip=${skip}`);
    return response as any;
  },

  sendMessage: async (driverId: number, message: string, attachmentUrl?: string, attachmentType?: string) => {
    const response = await api.post('/driver-portal/chat/send', {
      driverId, message, senderType: 'dispatch', senderId: 1, attachmentUrl, attachmentType
    });
    return response as any;
  },

  markAsRead: async (driverId: number) => {
    return await api.patch(`/driver-portal/chat/read/${driverId}`, { readerType: 'dispatch' });
  },

  setTyping: async (driverId: number, isTyping: boolean) => {
    return await api.post(`/driver-portal/chat/typing/${driverId}`, { isTyping });
  },

  getTypingStatus: async (driverId: number) => {
    return await api.get(`/driver-portal/chat/typing/${driverId}`);
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return await api.post('/upload/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};
