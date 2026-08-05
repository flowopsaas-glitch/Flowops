import { api } from './client';

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

// ── Types ────────────────────────────────────────────────────────────────

export type NotePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NoteCategory = 'INSTRUCTION' | 'ISSUE' | 'UPDATE' | 'GENERAL';

export type DeliveryNote = {
  id: string;
  companyId: string;
  waybillId: string | null;
  content: string;
  priority: NotePriority;
  category: NoteCategory | null;
  createdBy: string | null;
  createdByName: string | null;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateNotePayload = {
  content: string;
  waybillId?: string;
  priority?: NotePriority;
  category?: NoteCategory;
};

export type UpdateNotePayload = {
  content?: string;
  priority?: NotePriority;
  category?: NoteCategory;
  isResolved?: boolean;
};

// ── API Functions ────────────────────────────────────────────────────────

export const createDeliveryNote = async (payload: CreateNotePayload) =>
  unwrap<DeliveryNote>(await api.post('/delivery-notes', payload));

export const listDeliveryNotes = async (params?: Record<string, string>) =>
  arr<DeliveryNote>(await api.get('/delivery-notes', { params }));

export const getDeliveryNote = async (id: string) =>
  unwrap<DeliveryNote>(await api.get(`/delivery-notes/${id}`));

export const updateDeliveryNote = async (id: string, payload: UpdateNotePayload) =>
  unwrap<DeliveryNote>(await api.patch(`/delivery-notes/${id}`, payload));

export const deleteDeliveryNote = async (id: string) =>
  unwrap<void>(await api.delete(`/delivery-notes/${id}`));

export const resolveDeliveryNote = async (id: string) =>
  unwrap<DeliveryNote>(await api.post(`/delivery-notes/${id}/resolve`, {}));

export const getWaybillNotes = async (waybillId: string) =>
  arr<DeliveryNote>(await api.get(`/delivery-notes/waybill/${waybillId}`));
