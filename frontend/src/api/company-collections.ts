import api from '../lib/api';

export async function getCompanyCollections(companyId: string) {
  const response = await api.get(`/companies/${companyId}/collections`);
  return response.data;
}