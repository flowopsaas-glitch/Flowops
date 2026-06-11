import api from '../lib/api';

export async function getCollections() {
  const response = await api.get('/collections');
  return response.data;
}

// 🚀 NEW: Fetch the AI suggestion for a specific collection
export async function getSmartDriverSuggestion(collectionId: number) {
  const response = await api.get(`/collections/${collectionId}/auto-suggest`);
  return response.data; 
}