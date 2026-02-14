import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Phone, Clock, RefreshCw } from 'lucide-react';
import { callsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { CallStatusBadge, OutcomeBadge } from '../components/common/Badge';
import { formatDistanceToNow } from 'date-fns';
import { useWebSocket } from '../hooks/useWebSocket';

export function Calls() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  // Auto-refresh call list when calls complete or analytics are processed
  useWebSocket({
    onCallComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onCallAnalyticsReady: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onCallStatus: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['calls', { page, status: statusFilter }],
    queryFn: () =>
      callsApi.list({
        page,
        pageSize: 20,
        status: statusFilter || undefined,
      }),
  });

  const calls = data?.data?.data ?? [];
  const pagination = data?.data?.pagination;

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Call History</h1>
        <Button
          variant="secondary"
          size="sm"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              await callsApi.syncAll();
              queryClient.invalidateQueries({ queryKey: ['calls'] });
            } finally {
              setSyncing(false);
            }
          }}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync from VAPI'}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="NO_ANSWER">No Answer</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="QUEUED">Queued</option>
        </select>
      </div>

      {/* Calls list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : calls.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No calls yet</p>
            <Link to="/campaigns">
              <Button className="mt-4">Start a Campaign</Button>
            </Link>
          </div>
        ) : (
          calls.map((call) => (
            <Link
              key={call.id}
              to={`/calls/${call.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-gray-100 p-3">
                    <Phone className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {call.contact?.firstName} {call.contact?.lastName}
                      </span>
                      <CallStatusBadge status={call.status} />
                      {call.outcome && <OutcomeBadge outcome={call.outcome} />}
                    </div>
                    <p className="text-sm text-gray-500">{call.phoneNumber}</p>
                    <p className="text-xs text-gray-400">
                      {call.createdAt
                        ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })
                        : '-'}
                    </p>
                    {call.analytics?.summary && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-1">
                        {call.analytics.summary}
                      </p>
                    )}
                    {call.campaign && (
                      <span className="text-sm text-primary-600">
                        {call.campaign.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  <span>{formatDuration(call.duration)}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{' '}
            {pagination.totalItems} calls
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
