import { api } from './client';

/**
 * Process Control API client — the Process Book, its execution, evidence and
 * improvement loop.
 *
 * Every endpoint is tenant-scoped server-side from the access token; nothing
 * here sends a companyId. The whole capability is feature-flagged off by
 * default, so callers must handle `enabled: false` rather than assuming data.
 */

export type ProcessLifecycleStatus = 'DRAFT' | 'PILOT' | 'APPROVED' | 'RETIRED';
export type ProcessInstanceStatus = 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'ABANDONED' | 'FAILED';
export type IncidentSeverity = 'MINOR' | 'MAJOR' | 'BLOCKING' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'RESOLVED';
export type OutcomeStatus = 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS' | 'ABANDONED' | 'FAILED';

export type ProcessVersionSummary = {
  id: string;
  versionNumber: number;
  status: ProcessLifecycleStatus;
  contentHash: string;
  isImmutable: boolean;
  approvedAt?: string | null;
  pilotStartedAt?: string | null;
  retiredAt?: string | null;
  createdAt: string;
  _count?: { steps: number; instances: number };
};

export type ProcessStep = {
  id: string;
  stepNumber: number;
  code: string;
  name: string;
  description?: string | null;
  type: string;
  isAutomated: boolean;
  requiresHumanApproval: boolean;
  requiresEvidence: boolean;
  evidenceSchema?: Record<string, unknown> | null;
  validationRules?: Record<string, unknown> | null;
  nextStepOnSuccess?: string | null;
  nextStepOnFailure?: string | null;
  nextStepOnException?: string | null;
  allowedRoles: string[];
  slaMinutes?: number | null;
};

export type ProcessDefinition = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  ownerRole?: string | null;
  isActive: boolean;
  currentVersionId?: string | null;
  currentVersion?: ProcessVersionSummary | null;
  versions: ProcessVersionSummary[];
  execution?: {
    inProgress: number;
    blocked: number;
    completed: number;
    abandoned: number;
    failed: number;
  };
  createdAt: string;
};

export type ProcessInstance = {
  id: string;
  businessKey: string;
  status: ProcessInstanceStatus;
  startedAt: string;
  completedAt?: string | null;
  blockedAt?: string | null;
  context?: Record<string, unknown> | null;
  goodsReceiptId?: string | null;
  definition?: { code: string; name: string } | null;
  version?: { versionNumber: number; status: ProcessLifecycleStatus } | null;
  currentStep?: { code: string; name: string; stepNumber: number } | null;
  outcome?: { status: OutcomeStatus; firstTimeRight: boolean; durationMinutes?: number | null } | null;
  _count?: { incidents: number };
};

export type ProcessStepInstance = {
  id: string;
  stepNumber: number;
  code: string;
  name: string;
  attempt: number;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  executedByName?: string | null;
  evidence?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  notes?: string | null;
};

export type ProcessIncident = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  isBlocking: boolean;
  detectedAt: string;
  detectedBy?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  evidence?: Record<string, unknown> | null;
  instance?: { id: string; businessKey: string; status: ProcessInstanceStatus } | null;
  solutions?: ProcessSolution[];
};

export type ProcessSolution = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: 'PROPOSED' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED';
  proposedByName?: string | null;
  proposedAt: string;
};

export type ProcessInstanceDetail = ProcessInstance & {
  definition: ProcessDefinition;
  version: { versionNumber: number; status: ProcessLifecycleStatus; steps: ProcessStep[] };
  stepInstances: ProcessStepInstance[];
  incidents: ProcessIncident[];
  auditEvents: ProcessAuditEvent[];
  currentStep?: ProcessStep | null;
};

export type ProcessAuditEvent = {
  id: string;
  eventType: string;
  actorId: string;
  actorName?: string | null;
  description: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  createdAt: string;
};

export type ProcessBookEntry = ProcessDefinition;

export const processControlApi = {
  isEnabled: () => api.get<{ enabled: boolean }>('/process-control/enabled').then((r) => r.data),

  getBook: () => api.get<ProcessBookEntry[]>('/process-control/book').then((r) => r.data),

  listDefinitions: () => api.get<ProcessDefinition[]>('/process-control/definitions').then((r) => r.data),

  createDefinition: (body: { code: string; name: string; description?: string; category?: string; ownerRole?: string }) =>
    api.post<ProcessDefinition>('/process-control/definitions', body).then((r) => r.data),

  getDefinition: (id: string) =>
    api.get<ProcessDefinition & { versions: Array<ProcessVersionSummary & { steps: ProcessStep[] }> }>(
      `/process-control/definitions/${id}`,
    ).then((r) => r.data),

  createVersion: (definitionId: string, body: { steps: Array<Partial<ProcessStep> & { stepNumber: number; code: string; name: string }> }) =>
    api.post(`/process-control/definitions/${definitionId}/versions`, body).then((r) => r.data),

  updateVersionSteps: (versionId: string, body: { steps: Array<Partial<ProcessStep> & { stepNumber: number; code: string; name: string }> }) =>
    api.patch(`/process-control/versions/${versionId}/steps`, body).then((r) => r.data),

  transitionVersion: (versionId: string, to: ProcessLifecycleStatus, note?: string) =>
    api.post(`/process-control/versions/${versionId}/transition`, { to, note }).then((r) => r.data),

  listInstances: (params?: { status?: string; definitionId?: string }) =>
    api.get<ProcessInstance[]>('/process-control/instances', { params }).then((r) => r.data),

  startInstance: (body: { definitionCode?: string; definitionId?: string; businessKey: string; context?: Record<string, unknown> }) =>
    api.post<ProcessInstance>('/process-control/instances', body).then((r) => r.data),

  getInstance: (id: string) =>
    api.get<ProcessInstanceDetail>(`/process-control/instances/${id}`).then((r) => r.data),

  completeStep: (
    instanceId: string,
    body: {
      outcome: 'SUCCESS' | 'FAILURE' | 'EXCEPTION';
      evidence?: Record<string, unknown>;
      result?: Record<string, unknown>;
      notes?: string;
      nextStepCode?: string;
    },
  ) => api.post(`/process-control/instances/${instanceId}/steps/complete`, body).then((r) => r.data),

  recordOutcome: (instanceId: string, body: { lessonsLearned?: string; evidence?: Record<string, unknown> }) =>
    api.post(`/process-control/instances/${instanceId}/outcome`, body).then((r) => r.data),

  listIncidents: (params?: { status?: string; severity?: string }) =>
    api.get<ProcessIncident[]>('/process-control/incidents', { params }).then((r) => r.data),

  raiseIncident: (
    instanceId: string,
    body: { code: string; name: string; description?: string; severity?: IncidentSeverity; isBlocking?: boolean; evidence?: Record<string, unknown> },
  ) => api.post<ProcessIncident>(`/process-control/instances/${instanceId}/incidents`, body).then((r) => r.data),

  resolveIncident: (incidentId: string, body: { resolution: string; status?: IncidentStatus }) =>
    api.post<ProcessIncident>(`/process-control/incidents/${incidentId}/resolve`, body).then((r) => r.data),

  proposeSolution: (incidentId: string, body: { code: string; name: string; description: string }) =>
    api.post<ProcessSolution>(`/process-control/incidents/${incidentId}/solutions`, body).then((r) => r.data),

  resolveSolution: (solutionId: string, body: { status: 'APPROVED' | 'REJECTED' | 'IMPLEMENTED'; evidence?: Record<string, unknown> }) =>
    api.post(`/process-control/solutions/${solutionId}/resolve`, body).then((r) => r.data),

  proposeChange: (
    definitionId: string,
    body: { title: string; description: string; proposedChanges: Record<string, unknown>; outcomeId?: string; incidentId?: string },
  ) => api.post(`/process-control/definitions/${definitionId}/change-proposals`, body).then((r) => r.data),

  reviewChange: (proposalId: string, body: { status: string; reviewNotes?: string; implementedInVersionId?: string }) =>
    api.post(`/process-control/change-proposals/${proposalId}/review`, body).then((r) => r.data),

  listAudit: (params?: { instanceId?: string; definitionId?: string }) =>
    api.get<ProcessAuditEvent[]>('/process-control/audit', { params }).then((r) => r.data),
};
