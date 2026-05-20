import api from '../lib/api';

export async function getQuotes() {
  const response = await api.get('/quotes');
  return response.data;
}