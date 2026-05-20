import axios from 'axios';

// Create a base axios instance
const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ----- Collections API -----
export const collectionsApi = {
  getAll: async (companyId: number) => {
    const response = await api.get(`/collections?companyId=${companyId}`);
    return response.data;
  },

  create: async (name: string, companyId: number, createdById: number) => {
    const response = await api.post('/collections', {
      name,
      status: 'ACTIVE',
      companyId,
      createdById,
    });
    return response.data;
  },
};