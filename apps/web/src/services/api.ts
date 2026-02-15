import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'An error occurred';
    console.error('API Error:', message);
    return Promise.reject(error);
  }
);

// Types
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string | null;
  studentName?: string | null;
  studentGrade?: string | null;
  relationship?: string | null;
  language: string;
  timezone: string;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  assistantId?: string | null;
  assistant?: { id: string; name: string } | null;
  vapiAssistantId: string;
  vapiPhoneNumberId?: string | null;
  totalContacts: number;
  completedCalls: number;
  failedCalls: number;
  maxConcurrentCalls: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface Transcript {
  id: string;
  callId: string;
  fullText: string;
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  recordingUrl?: string | null;
  recordingDuration?: number | null;
}

export interface CallAnalytics {
  id: string;
  callId: string;
  overallSentiment?: string | null;
  keyTopics: string[];
  speakerTurns?: number | null;
  summary?: string | null;
  customFields?: {
    callResult?: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
    outcomeReason?: string;
    interestLevel?: string;
    appointmentDetails?: {
      scheduled: boolean;
      date?: string;
      time?: string;
      type?: string;
    } | null;
    followUp?: {
      required: boolean;
      notes?: string;
    } | null;
    vapiSummary?: string;
    vapiAnalysis?: Record<string, unknown>;
    vapiStructuredData?: Record<string, unknown> | null;
  } | null;
  processedAt?: string | null;
  processingError?: string | null;
}

export interface Call {
  id: string;
  campaignId?: string | null;
  contactId?: string | null;
  vapiCallId?: string | null;
  status: string;
  outcome?: string | null;
  phoneNumber: string;
  duration?: number | null;
  cost?: number | string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  endedReason?: string | null;
  createdAt: string;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string | null;
    studentName?: string | null;
    studentGrade?: string | null;
  } | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
  transcript?: Transcript | null;
  analytics?: CallAnalytics | null;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// Contacts API
export const contactsApi = {
  list: (params?: { page?: number; pageSize?: number; search?: string; isActive?: boolean; importBatchId?: string }) =>
    api.get<PaginatedResponse<Contact>>('/contacts', { params }),

  get: (id: string) => api.get<ApiResponse<Contact>>(`/contacts/${id}`),

  create: (data: Partial<Contact>) => api.post<ApiResponse<Contact>>('/contacts', data),

  update: (id: string, data: Partial<Contact>) =>
    api.put<ApiResponse<Contact>>(`/contacts/${id}`, data),

  delete: (id: string) => api.delete(`/contacts/${id}`),

  import: (file: File, batchName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (batchName) formData.append('batchName', batchName);
    return api.post('/contacts/import', formData, {
      headers: { 'Content-Type': undefined },
    });
  },

  getImportStatus: (importId: string) => api.get(`/contacts/import/${importId}/status`),

  listImportBatches: () => api.get<ApiResponse<Array<{ id: string; name: string; successCount: number; createdAt: string }>>>('/contacts/import/batches'),

  exportCsv: () => api.get('/contacts/export', { responseType: 'blob' }),

  downloadTemplate: () => api.get('/contacts/template', { responseType: 'blob' }),

  getStats: () => api.get<ApiResponse<{ total: number; active: number }>>('/contacts/stats'),
};

// Campaigns API
export const campaignsApi = {
  list: (params?: { page?: number; pageSize?: number; status?: string; search?: string }) =>
    api.get<PaginatedResponse<Campaign>>('/campaigns', { params }),

  get: (id: string) => api.get<ApiResponse<Campaign>>(`/campaigns/${id}`),

  create: (data: {
    name: string;
    description?: string;
    assistantId?: string;
    vapiAssistantId?: string;
    maxConcurrentCalls?: number;
  }) => api.post<ApiResponse<Campaign>>('/campaigns', data),

  update: (id: string, data: Partial<Campaign>) =>
    api.put<ApiResponse<Campaign>>(`/campaigns/${id}`, data),

  delete: (id: string) => api.delete(`/campaigns/${id}`),

  addContacts: (id: string, contactIds: string[]) =>
    api.post(`/campaigns/${id}/contacts`, { contactIds }),

  removeContacts: (id: string, contactIds: string[]) =>
    api.delete(`/campaigns/${id}/contacts`, { data: { contactIds } }),

  start: (id: string) => api.post(`/campaigns/${id}/start`),

  pause: (id: string) => api.post(`/campaigns/${id}/pause`),

  resume: (id: string) => api.post(`/campaigns/${id}/resume`),

  cancel: (id: string) => api.post(`/campaigns/${id}/cancel`),

  reset: (id: string) => api.post<ApiResponse<Campaign>>(`/campaigns/${id}/reset`),

  getProgress: (id: string) => api.get(`/campaigns/${id}/progress`),

  getStats: () =>
    api.get<ApiResponse<{ total: number; active: number; completed: number }>>('/campaigns/stats'),
};

// Calls API
export const callsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    campaignId?: string;
    contactId?: string;
    status?: string;
  }) => api.get<PaginatedResponse<Call>>('/calls', { params }),

  get: (id: string) => api.get<ApiResponse<Call>>(`/calls/${id}`),

  getTranscript: (id: string) => api.get(`/calls/${id}/transcript`),

  getAnalytics: (id: string) => api.get(`/calls/${id}/analytics`),

  getStats: () => api.get('/calls/stats'),

  syncAll: () => api.post<ApiResponse<{ synced: number; errors: number }>>('/calls/sync'),

  syncOne: (id: string) => api.post<ApiResponse<{ synced: boolean }>>(`/calls/${id}/sync`),
};

// Analytics API
export const analyticsApi = {
  getDashboard: () => api.get('/analytics/dashboard'),

  getCampaignAnalytics: (campaignId: string) => api.get(`/analytics/campaigns/${campaignId}`),

  reprocessCall: (callId: string) => api.post(`/analytics/calls/${callId}/reprocess`),
};
