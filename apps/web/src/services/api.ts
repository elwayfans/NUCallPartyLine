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

export interface Call {
  id: string;
  campaignId?: string | null;
  contactId: string;
  vapiCallId?: string | null;
  status: string;
  phoneNumber: string;
  duration?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  endedReason?: string | null;
  createdAt: string;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
  campaign?: {
    id: string;
    name: string;
  };
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
  list: (params?: { page?: number; pageSize?: number; search?: string; isActive?: boolean }) =>
    api.get<PaginatedResponse<Contact>>('/contacts', { params }),

  get: (id: string) => api.get<ApiResponse<Contact>>(`/contacts/${id}`),

  create: (data: Partial<Contact>) => api.post<ApiResponse<Contact>>('/contacts', data),

  update: (id: string, data: Partial<Contact>) =>
    api.put<ApiResponse<Contact>>(`/contacts/${id}`, data),

  delete: (id: string) => api.delete(`/contacts/${id}`),

  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/contacts/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getImportStatus: (importId: string) => api.get(`/contacts/import/${importId}/status`),

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
};

// Analytics API
export const analyticsApi = {
  getDashboard: () => api.get('/analytics/dashboard'),

  getCampaignAnalytics: (campaignId: string) => api.get(`/analytics/campaigns/${campaignId}`),

  reprocessCall: (callId: string) => api.post(`/analytics/calls/${callId}/reprocess`),
};
