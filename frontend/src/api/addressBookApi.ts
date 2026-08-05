import api from './client';

export interface AddressEntry {
  id: string;
  label: string;
  type: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address: string;
  city?: string;
  postalCode?: string;
  country: string;
  lat?: number;
  lng?: number;
  usageCount: number;
}

export const getAddressBook = (type?: string) =>
  api.get('/address-book', { params: type ? { type } : {} });

export const searchAddresses = (query: string, type?: string) =>
  api.get('/address-book', { params: { type: type || 'ALL' } }).then((res: any) => {
    const data: AddressEntry[] = Array.isArray(res?.data ?? res) ? (res?.data ?? res) : [];
    if (!query.trim()) return data.slice(0, 10);
    const q = query.toLowerCase();
    return data.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.label?.toLowerCase().includes(q) ||
        a.address?.toLowerCase().includes(q) ||
        a.city?.toLowerCase().includes(q) ||
        a.company?.toLowerCase().includes(q) ||
        a.phone?.includes(q),
    ).slice(0, 8);
  });

export const createAddress = (data: any) => api.post('/address-book', data);
export const markUsed = (id: string) => api.patch(`/address-book/${id}/used`, {}).catch(() => {});
