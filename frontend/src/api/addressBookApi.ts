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
  api.get('/address-book', { params: { type: type || 'ALL' } }).then((res) => {
    const body = res as { data?: unknown } | null;
    const data: AddressEntry[] = Array.isArray(body?.data ?? res) ? ((body?.data ?? res) as AddressEntry[]) : [];
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

export const createAddress = (data: Record<string, unknown>) => api.post('/address-book', data);
