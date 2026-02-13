import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Phone, Clock, Users } from 'lucide-react';
import { analyticsApi, callsApi } from '../services/api';
import { SentimentBadge } from '../components/common/Badge';

export function Analytics() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => analyticsApi.getDashboard(),
  });

  const { data: callStats } = useQuery({
    queryKey: ['calls', 'stats'],
    queryFn: () => callsApi.getStats(),
  });

  const dashboard = dashboardData?.data?.data;
  const stats = callStats?.data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  const statCards = [
    {
      name: 'Total Calls',
      value: dashboard?.totalCalls ?? 0,
      icon: Phone,
      color: 'bg-blue-500',
    },
    {
      name: 'Calls Today',
      value: dashboard?.callsToday ?? 0,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      name: 'Avg Duration',
      value: `${Math.round(dashboard?.avgDuration ?? 0)}s`,
      icon: Clock,
      color: 'bg-purple-500',
    },
    {
      name: 'Completed',
      value: stats?.completed ?? 0,
      icon: Users,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="overflow-hidden rounded-lg bg-white p-5 shadow"
          >
            <div className="flex items-center">
              <div className={`rounded-md ${stat.color} p-3`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sentiment Distribution */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Sentiment Distribution
          </h2>
          {dashboard?.sentimentDistribution &&
          Object.keys(dashboard.sentimentDistribution).length > 0 ? (
            <div className="space-y-4">
              {dashboard.dominantSentiment && (
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-sm text-gray-600">Overall:</span>
                  <SentimentBadge sentiment={dashboard.dominantSentiment} />
                </div>
              )}
              {Object.entries(dashboard.sentimentDistribution)
                .filter(([key]) => key !== 'UNKNOWN' && key !== 'null')
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([sentiment, count]) => {
                  const total = Object.values(dashboard.sentimentDistribution)
                    .filter((v, i, arr) => {
                      const key = Object.keys(dashboard.sentimentDistribution)[arr.indexOf(v)];
                      return key !== 'UNKNOWN' && key !== 'null';
                    })
                    .reduce((sum: number, v) => sum + (v as number), 0);
                  const percentage = total > 0 ? ((count as number) / total) * 100 : 0;

                  return (
                    <div key={sentiment}>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {sentiment.replace('_', ' ')}
                        </span>
                        <span className="font-medium">
                          {count as number} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full ${
                            sentiment.includes('POSITIVE')
                              ? 'bg-green-500'
                              : sentiment === 'NEUTRAL'
                              ? 'bg-gray-400'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No sentiment data available yet. Complete some calls to see analytics.
            </p>
          )}
        </div>

        {/* Call Outcomes */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Call Outcomes</h2>
          {stats ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Completed</span>
                <span className="font-semibold text-green-600">{stats.completed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Failed</span>
                <span className="font-semibold text-red-600">{stats.failed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">{stats.total}</span>
              </div>
              {stats.total > 0 && (
                <div className="pt-4">
                  <p className="text-sm text-gray-500">Success Rate</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {((stats.completed / stats.total) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No call data available.</p>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h3 className="font-semibold text-blue-900">Analytics Tips</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-800">
          <li>Sentiment analysis is powered by OpenAI and runs automatically after each call</li>
          <li>View individual call details to see extracted responses and key topics</li>
          <li>Campaign-specific analytics are available on each campaign's detail page</li>
          <li>Call transcripts are stored for review and can be exported</li>
        </ul>
      </div>
    </div>
  );
}
