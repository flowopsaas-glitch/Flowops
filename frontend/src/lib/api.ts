import { api, setMemoryToken } from '../api/client';

// Re-export for consumers
export { api, setMemoryToken };

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
    const response = await api.post('/api/v1/workflows', workflow);
    return response.data;
  },

  getWorkflow: async (id: string): Promise<Workflow> => {
    const response = await api.get(`/api/v1/workflows/${id}`);
    return response.data;
  },

  getAllWorkflows: async (): Promise<Workflow[]> => {
    const response = await api.get('/api/v1/workflows');
    return response.data;
  },

  updateWorkflow: async (id: string, workflow: Workflow): Promise<Workflow> => {
    const response = await api.put(`/api/v1/workflows/${id}`, workflow);
    return response.data;
  },

  deleteWorkflow: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/workflows/${id}`);
  },
};

/* ============================
   Memory API
============================ */

export const memoryApi = {
  createDatabaseDefinition: async (
    databaseDefinition: DatabaseDefinition,
  ): Promise<DatabaseDefinition> => {
    const response = await api.post('/api/v1/memory/databases', databaseDefinition);
    return response.data;
  },

  getDatabaseDefinition: async (id: string): Promise<DatabaseDefinition> => {
    const response = await api.get(`/api/v1/memory/databases/${id}`);
    return response.data;
  },

  getDatabaseDefinitionsByWorkflowId: async (
    workflowId: string,
  ): Promise<DatabaseDefinition[]> => {
    const response = await api.get(
      `/api/v1/memory/workflows/${workflowId}/databases`,
    );
    return response.data;
  },
};

export default api;
