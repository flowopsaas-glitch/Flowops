import api from '../lib/api';

export async function getCollections() {
  const response = await api.get('/collections');
  return response.data;
}