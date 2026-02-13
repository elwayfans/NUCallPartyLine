// Contact Types
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
  metadata?: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  studentName?: string;
  studentGrade?: string;
  relationship?: string;
  language?: string;
  timezone?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateContactInput extends Partial<CreateContactInput> {
  isActive?: boolean;
}

// Campaign Types
export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: CampaignStatus;
  vapiAssistantId: string;
  vapiPhoneNumberId?: string | null;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  maxConcurrentCalls: number;
  retryAttempts: number;
  retryDelayMinutes: number;
  totalContacts: number;
  completedCalls: number;
  failedCalls: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  vapiAssistantId: string;
  vapiPhoneNumberId?: string;
  maxConcurrentCalls?: number;
  retryAttempts?: number;
  retryDelayMinutes?: number;
}

// Call Types
export type CallStatus =
  | 'QUEUED'
  | 'SCHEDULED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'VOICEMAIL'
  | 'CANCELLED';

export type CallOutcome =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'NO_RESPONSE'
  | 'CALLBACK_REQUESTED'
  | 'WRONG_NUMBER'
  | 'DECLINED'
  | 'TECHNICAL_FAILURE';

export interface Call {
  id: string;
  campaignId?: string | null;
  contactId: string;
  vapiCallId?: string | null;
  vapiAssistantId: string;
  status: CallStatus;
  direction: 'OUTBOUND' | 'INBOUND';
  phoneNumber: string;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  duration?: number | null;
  endedReason?: string | null;
  outcome?: CallOutcome | null;
  attemptNumber: number;
  cost?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Transcript Types
export interface TranscriptMessage {
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp?: number;
}

export interface Transcript {
  id: string;
  callId: string;
  fullText: string;
  messages: TranscriptMessage[];
  recordingUrl?: string | null;
  recordingDuration?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics Types
export type SentimentScore =
  | 'VERY_POSITIVE'
  | 'POSITIVE'
  | 'NEUTRAL'
  | 'NEGATIVE'
  | 'VERY_NEGATIVE';

export interface SentimentBreakdown {
  positive: number;
  negative: number;
  neutral: number;
}

export interface CallAnalytics {
  id: string;
  callId: string;
  overallSentiment?: SentimentScore | null;
  sentimentConfidence?: number | null;
  sentimentBreakdown?: SentimentBreakdown | null;
  extractedResponses?: Record<string, string> | null;
  keyTopics: string[];
  speakerTurns?: number | null;
  avgResponseTime?: number | null;
  silencePercentage?: number | null;
  customFields?: Record<string, unknown> | null;
  processedAt?: Date | null;
  processingError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// CSV Import Types
export type ImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CsvImport {
  id: string;
  filename: string;
  status: ImportStatus;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors?: Array<{ row: number; error: string }> | null;
  createdAt: Date;
  completedAt?: Date | null;
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// WebSocket Event Types
export interface CallStatusEvent {
  type: 'call:status';
  callId: string;
  vapiCallId?: string;
  status: CallStatus;
  campaignId?: string;
}

export interface CampaignProgressEvent {
  type: 'campaign:progress';
  campaignId: string;
  completedCalls: number;
  failedCalls: number;
  totalContacts: number;
}

export interface TranscriptEvent {
  type: 'call:transcript';
  callId: string;
  vapiCallId: string;
  role: string;
  content: string;
  isFinal: boolean;
}

export type WebSocketEvent =
  | CallStatusEvent
  | CampaignProgressEvent
  | TranscriptEvent;

// Dashboard Stats
export interface DashboardStats {
  totalContacts: number;
  activeContacts: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalCalls: number;
  callsToday: number;
  avgSentiment: SentimentScore | null;
}
