import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { callsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { CallStatusBadge } from '../components/common/Badge';
import { useWebSocket } from '../hooks/useWebSocket';

export function Calls() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const connectedOutcomes = ['SUCCESS', 'PARTIAL', 'CALLBACK_REQUESTED', 'DECLINED'];
  const notConnectedOutcomes = ['NO_RESPONSE', 'WRONG_NUMBER', 'TECHNICAL_FAILURE'];

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
      <div className="rounded-lg border border-gray-200 bg-white shadow">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No calls yet</p>
            <Link to="/campaigns">
              <Button className="mt-4">Start a Campaign</Button>
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Result</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Reached</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Appt</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Campaign</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Duration</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {calls.map((call) => {
                const isCompleted = call.status === 'COMPLETED';
                const isFailed = ['FAILED', 'NO_ANSWER', 'BUSY'].includes(call.status);
                const isConnected = call.outcome && connectedOutcomes.includes(call.outcome);
                const isNotConnected = call.outcome && notConnectedOutcomes.includes(call.outcome);
                const hasAppt = (call as any).analytics?.customFields?.appointmentDetails?.scheduled === true;
                return (
                <tr
                  key={call.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/calls/${call.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {call.contact ? `${call.contact.firstName} ${call.contact.lastName}` : <span className="italic text-gray-400">&lt;Test Call&gt;</span>}
                    </p>
                    <p className="text-sm text-gray-500">{call.phoneNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CallStatusBadge status={call.status} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isCompleted ? <span className="font-medium text-green-600">Completed</span>
                      : isFailed ? <span className="font-medium text-red-600">Failed</span>
                      : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isConnected ? <span className="font-medium text-green-600">Connected</span>
                      : isNotConnected ? <span className="font-medium text-red-600">No</span>
                      : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {hasAppt ? <span className="font-medium text-green-600">Booked</span>
                      : (isCompleted || isFailed) ? <span className="font-medium text-red-600">No</span>
                      : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {call.campaign?.name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDuration(call.duration)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
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
