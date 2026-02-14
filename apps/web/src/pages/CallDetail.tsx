import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, DollarSign, Calendar, CheckCircle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { callsApi, type CallAnalytics } from '../services/api';
import { Button } from '../components/common/Button';
import { CallStatusBadge, SentimentBadge, OutcomeBadge, CallResultBadge } from '../components/common/Badge';
import { useWebSocket } from '../hooks/useWebSocket';

export function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Auto-refresh when call completes or analytics are processed
  useWebSocket({
    onCallComplete: (event) => {
      if (event.callId === id) {
        queryClient.invalidateQueries({ queryKey: ['calls', id] });
        queryClient.invalidateQueries({ queryKey: ['calls', id, 'transcript'] });
      }
    },
    onCallAnalyticsReady: (event) => {
      if (event.callId === id) {
        queryClient.invalidateQueries({ queryKey: ['calls', id] });
        queryClient.invalidateQueries({ queryKey: ['calls', id, 'analytics'] });
      }
    },
    onCallStatus: (event) => {
      if (event.callId === id) {
        queryClient.invalidateQueries({ queryKey: ['calls', id] });
      }
    },
  });

  const { data: callData, isLoading: callLoading } = useQuery({
    queryKey: ['calls', id],
    queryFn: () => callsApi.get(id!),
    enabled: !!id,
  });

  const { data: transcriptData } = useQuery({
    queryKey: ['calls', id, 'transcript'],
    queryFn: () => callsApi.getTranscript(id!),
    enabled: !!id,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['calls', id, 'analytics'],
    queryFn: () => callsApi.getAnalytics(id!),
    enabled: !!id,
  });

  const call = callData?.data?.data;
  const transcript = transcriptData?.data?.data;
  const analytics = analyticsData?.data?.data as CallAnalytics | undefined;
  const customFields = analytics?.customFields;

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (callLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Call not found</p>
        <Link to="/calls">
          <Button variant="secondary" className="mt-4">
            Back to Calls
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/calls">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Details</h1>
          <p className="text-sm text-gray-500">
            {call.contact?.firstName} {call.contact?.lastName} - {call.phoneNumber}
          </p>
        </div>
      </div>

      {/* Main layout: content left, transcript sidebar right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column - main content */}
        <div className="space-y-6 min-w-0">
          {/* Call Info + Contact side by side */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Call Info */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Call Information</h2>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-gray-500">Status</dt>
                  <dd><CallStatusBadge status={call.status} /></dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-gray-500">Duration</dt>
                  <dd className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-medium">{formatDuration(call.duration)}</span>
                  </dd>
                </div>
                {call.cost && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Cost</dt>
                    <dd className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm font-medium">${Number(call.cost).toFixed(4)}</span>
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-gray-500">Started</dt>
                  <dd className="text-sm">{call.startedAt ? format(new Date(call.startedAt), 'PPpp') : '-'}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-gray-500">Ended</dt>
                  <dd className="text-sm">{call.endedAt ? format(new Date(call.endedAt), 'PPpp') : '-'}</dd>
                </div>
                {call.endedReason && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">End Reason</dt>
                    <dd className="text-sm">{call.endedReason}</dd>
                  </div>
                )}
                {call.campaign && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Campaign</dt>
                    <dd>
                      <Link to={`/campaigns/${call.campaign.id}`} className="text-sm text-primary-600 hover:underline">
                        {call.campaign.name}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Contact Info */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Contact</h2>
              {call.contact ? (
                <dl className="space-y-3">
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Name</dt>
                    <dd className="text-sm font-medium">{call.contact.firstName} {call.contact.lastName}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Phone</dt>
                    <dd className="text-sm">{call.phoneNumber}</dd>
                  </div>
                  {call.contact.email && (
                    <div className="flex items-center justify-between">
                      <dt className="text-sm text-gray-500">Email</dt>
                      <dd className="text-sm">{call.contact.email}</dd>
                    </div>
                  )}
                  {call.contact.studentName && (
                    <div className="flex items-center justify-between">
                      <dt className="text-sm text-gray-500">Student</dt>
                      <dd className="text-sm">
                        {call.contact.studentName}
                        {call.contact.studentGrade && ` (${call.contact.studentGrade})`}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <dl className="space-y-3">
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Phone</dt>
                    <dd className="text-sm">{call.phoneNumber}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-500">Type</dt>
                    <dd className="text-sm text-gray-600">Test Call (no linked contact)</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>

          {/* Call Summary */}
          {(analytics?.summary || call.outcome) && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-base font-semibold text-gray-900">Call Summary</h2>
                    {call.outcome && <OutcomeBadge outcome={call.outcome} />}
                    {customFields?.callResult && <CallResultBadge result={customFields.callResult} />}
                  </div>
                  {analytics?.summary && (
                    <p className="text-sm text-gray-700 leading-relaxed">{analytics.summary}</p>
                  )}
                  {customFields?.outcomeReason && (
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed"><span className="font-semibold">Outcome:</span> {customFields.outcomeReason}</p>
                  )}
                  {customFields?.callResultReason && (
                    <p className="mt-1 text-sm text-gray-700 leading-relaxed"><span className="font-semibold">Result:</span> {customFields.callResultReason}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Appointment Details */}
          {customFields?.appointmentDetails?.scheduled && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-blue-900">Appointment Scheduled</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {customFields.appointmentDetails.date && (
                  <div>
                    <dt className="text-xs font-medium text-blue-600">Date</dt>
                    <dd className="text-sm text-blue-900">{customFields.appointmentDetails.date}</dd>
                  </div>
                )}
                {customFields.appointmentDetails.time && (
                  <div>
                    <dt className="text-xs font-medium text-blue-600">Time</dt>
                    <dd className="text-sm text-blue-900">{customFields.appointmentDetails.time}</dd>
                  </div>
                )}
                {customFields.appointmentDetails.location && (
                  <div>
                    <dt className="text-xs font-medium text-blue-600">Location</dt>
                    <dd className="text-sm text-blue-900">{customFields.appointmentDetails.location}</dd>
                  </div>
                )}
                {customFields.appointmentDetails.type && (
                  <div>
                    <dt className="text-xs font-medium text-blue-600">Type</dt>
                    <dd className="text-sm text-blue-900">{customFields.appointmentDetails.type}</dd>
                  </div>
                )}
              </div>
              {customFields.appointmentDetails.notes && (
                <p className="mt-3 text-sm text-blue-800">
                  <span className="font-medium">Notes:</span> {customFields.appointmentDetails.notes}
                </p>
              )}
            </div>
          )}

          {/* Analytics */}
          {analytics && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Analytics</h2>
              <dl className="space-y-4">
                {/* Speaker turns + success eval - available from VAPI path */}
                {(analytics.speakerTurns || customFields?.vapiAnalysis?.successEvaluation != null) && (
                  <div className="flex gap-6">
                    {analytics.speakerTurns != null && analytics.speakerTurns > 0 && (
                      <div>
                        <dt className="text-sm text-gray-500">Speaker Turns</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">{analytics.speakerTurns}</dd>
                      </div>
                    )}
                    {customFields?.vapiAnalysis?.successEvaluation != null && (
                      <div>
                        <dt className="text-sm text-gray-500">Success Evaluation</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900 capitalize">
                          {String(customFields.vapiAnalysis.successEvaluation)}
                        </dd>
                      </div>
                    )}
                  </div>
                )}
                {/* Sentiment - from OpenAI fallback path */}
                {analytics.overallSentiment && (
                  <div>
                    <dt className="text-sm text-gray-500">Overall Sentiment</dt>
                    <dd className="mt-1">
                      <SentimentBadge sentiment={analytics.overallSentiment} />
                      {analytics.sentimentConfidence && (
                        <span className="ml-2 text-sm text-gray-500">
                          ({Math.round(analytics.sentimentConfidence * 100)}% confidence)
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {analytics.keyTopics?.length > 0 && (
                  <div>
                    <dt className="text-sm text-gray-500">Key Topics</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {analytics.keyTopics.map((topic: string) => (
                        <span
                          key={topic}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
                        >
                          {topic}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {customFields?.actionItems && customFields.actionItems.length > 0 && (
                  <div>
                    <dt className="flex items-center gap-1 text-sm text-gray-500">
                      <CheckCircle className="h-3.5 w-3.5" /> Action Items
                    </dt>
                    <dd className="mt-2">
                      <ul className="space-y-1">
                        {customFields.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {customFields?.nextSteps && customFields.nextSteps.length > 0 && (
                  <div>
                    <dt className="flex items-center gap-1 text-sm text-gray-500">
                      <ArrowRight className="h-3.5 w-3.5" /> Next Steps
                    </dt>
                    <dd className="mt-2">
                      <ul className="space-y-1">
                        {customFields.nextSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            {step}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {analytics.extractedResponses && Object.keys(analytics.extractedResponses).length > 0 && (
                  <div>
                    <dt className="text-sm text-gray-500">Extracted Responses</dt>
                    <dd className="mt-2 space-y-2">
                      {Object.entries(analytics.extractedResponses).map(([question, answer]) => (
                        <div key={question} className="rounded bg-gray-50 p-2">
                          <p className="text-xs font-medium text-gray-600">{question}</p>
                          <p className="text-sm text-gray-900">{answer as string}</p>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
                {/* VAPI structured data entries */}
                {customFields?.vapiStructuredData && Object.keys(customFields.vapiStructuredData).length > 0 && (
                  <div>
                    <dt className="text-sm text-gray-500">Structured Data</dt>
                    <dd className="mt-2 space-y-2">
                      {Object.entries(customFields.vapiStructuredData).map(([key, value]) => (
                        <div key={key} className="rounded bg-gray-50 p-2">
                          <p className="text-xs font-medium text-gray-600">{key}</p>
                          <p className="text-sm text-gray-900">{String(value)}</p>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        {/* Right column - Transcript sidebar */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-base font-semibold text-gray-900">Transcript</h2>
            </div>
            {transcript?.recordingUrl && (
              <div className="border-b border-gray-200 px-5 py-3">
                <audio controls className="w-full h-8">
                  <source src={transcript.recordingUrl} />
                  <a
                    href={transcript.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Download Recording
                  </a>
                </audio>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {transcript?.messages?.length > 0 ? (
                <div className="space-y-3">
                  {transcript.messages
                    .filter((m: Record<string, unknown>) => m.role !== 'system')
                    .map((message: Record<string, unknown>, index: number) => {
                      const role = message.role === 'bot' ? 'assistant' : (message.role as string);
                      const text = (message.content ?? message.message ?? '') as string;
                      if (!text) return null;
                      const isAI = role === 'assistant';
                      return (
                        <div
                          key={index}
                          className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[90%] rounded-lg px-3 py-2 ${
                              isAI
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-primary-100 text-primary-900'
                            }`}
                          >
                            <p className="mb-0.5 text-[10px] font-medium uppercase text-gray-500">
                              {isAI ? 'AI' : 'Contact'}
                            </p>
                            <p className="text-sm leading-relaxed">{text}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : transcript?.fullText ? (
                <div className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-900">
                  {transcript.fullText}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No transcript available for this call.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
