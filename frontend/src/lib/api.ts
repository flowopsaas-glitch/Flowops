/**
 * lib/api.ts — Workflow + Memory API helpers and shared types.
 *
 * The `api` instance from api/client is re-exported as the default for the
 * handful of files in api/* and hooks/* that still import it from here.
 * New code should import directly from `api/client`.
 *
 * NOTE: workflowApi / memoryApi call response.data because the workflow
 * backend wraps its payloads as { data: T }. Do not remove those .data
 * accesses without verifying the backend response shape.
 */
import { api } from '../api/client';

export default api;

/* ============================
   Shared Types
============================ */

export interface SelectOption {
  id?: string;
  label: string;
  color?: string;
}

export interface Column {
  id?: string;
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  options?: SelectOption[];
}

export interface DatabaseDefinition {
  id?: string;
  name: string;
  workflowId: string;
  columns: Column[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Workflow {
  id?: string;
  name: string;
  script: string;
  databaseColumns?: Column[];
  createdAt?: string;
  updatedAt?: string;

  // UI-only fields
  status?: 'active' | 'inactive';
  dotColor?: string;
  activityData?: number[];
  cost?: string;
}

/* ============================
   Workflow API
============================ */

export const workflowApi = {
  createWorkflow: async (workflow: Workflow): Promise<Workflow> => {
    const response = await api.post('/workflows', workflow);
    return response.data;
  },

  getWorkflow: async (id: string): Promise<Workflow> => {
    const response = await api.get(`/workflows/${id}`);
    return response.data;
  },

  getAllWorkflows: async (): Promise<Workflow[]> => {
    const response = await api.get('/workflows');
    return response.data;
  },

  updateWorkflow: async (id: string, workflow: Workflow): Promise<Workflow> => {
    const response = await api.put(`/workflows/${id}`, workflow);
    return response.data;
  },

  deleteWorkflow: async (id: string): Promise<void> => {
    await api.delete(`/workflows/${id}`);
  },
};

/* ============================
   Memory API
============================ */

export const memoryApi = {
  createDatabaseDefinition: async (
    databaseDefinition: DatabaseDefinition,
  ): Promise<DatabaseDefinition> => {
    const response = await api.post('/memory/databases', databaseDefinition);
    return response.data;
  },

  getDatabaseDefinition: async (id: string): Promise<DatabaseDefinition> => {
    const response = await api.get(`/memory/databases/${id}`);
    return response.data;
  },

  getDatabaseDefinitionsByWorkflowId: async (
    workflowId: string,
  ): Promise<DatabaseDefinition[]> => {
    const response = await api.get(`/memory/workflows/${workflowId}/databases`);
    return response.data;
  },
};
