import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Clock, DollarSign, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { callsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { CallStatusBadge, SentimentBadge } from '../components/common/Badge';

export function CallDetail() {
  const { id } = useParams<{ id: string }>();

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
  const analytics = analyticsData?.data?.data;

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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Call Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Call Information</h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-gray-500">Status</dt>
              <dd className="mt-1">
                <CallStatusBadge status={call.status} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Duration</dt>
              <dd className="mt-1 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{formatDuration(call.duration)}</span>
              </dd>
            </div>
            {call.cost && (
              <div>
                <dt className="text-sm text-gray-500">Cost</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">${Number(call.cost).toFixed(4)}</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-gray-500">Started</dt>
              <dd className="mt-1 text-sm">
                {call.startedAt ? format(new Date(call.startedAt), 'PPpp') : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Ended</dt>
              <dd className="mt-1 text-sm">
                {call.endedAt ? format(new Date(call.endedAt), 'PPpp') : '-'}
              </dd>
            </div>
            {call.endedReason && (
              <div>
                <dt className="text-sm text-gray-500">End Reason</dt>
                <dd className="mt-1 text-sm">{call.endedReason}</dd>
              </div>
            )}
            {call.campaign && (
              <div>
                <dt className="text-sm text-gray-500">Campaign</dt>
                <dd className="mt-1">
                  <Link
                    to={`/campaigns/${call.campaign.id}`}
                    className="text-primary-600 hover:underline"
                  >
                    {call.campaign.name}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Analytics */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Analytics</h2>
          {analytics ? (
            <dl className="space-y-4">
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
            </dl>
          ) : (
            <p className="text-sm text-gray-500">
              Analytics not yet processed for this call.
            </p>
          )}
        </div>

        {/* Contact Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Contact</h2>
          {call.contact ? (
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Name</dt>
                <dd className="mt-1 font-medium">
                  {call.contact.firstName} {call.contact.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Phone</dt>
                <dd className="mt-1">{call.phoneNumber}</dd>
              </div>
              {call.contact.email && (
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="mt-1">{call.contact.email}</dd>
                </div>
              )}
              {call.contact.studentName && (
                <div>
                  <dt className="text-sm text-gray-500">Student</dt>
                  <dd className="mt-1">
                    {call.contact.studentName}
                    {call.contact.studentGrade && ` (${call.contact.studentGrade})`}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Contact information not available.</p>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Transcript</h2>
          {transcript?.recordingUrl && (
            <a
              href={transcript.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:underline"
            >
              Listen to Recording
            </a>
          )}
        </div>

        {transcript?.messages?.length > 0 ? (
          <div className="space-y-4">
            {transcript.messages.map((message: { role: string; content: string }, index: number) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'assistant' ? 'justify-start' : 'justify-end'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'assistant'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-primary-100 text-primary-900'
                  }`}
                >
                  <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                    {message.role === 'assistant' ? 'AI' : 'Contact'}
                  </p>
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : transcript?.fullText ? (
          <div className="whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm text-gray-900">
            {transcript.fullText}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No transcript available for this call.</p>
        )}
      </div>
    </div>
  );
}
