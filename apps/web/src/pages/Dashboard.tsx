import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, Phone, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { contactsApi, campaignsApi, callsApi, analyticsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { CampaignStatusBadge, SentimentBadge } from '../components/common/Badge';

export function Dashboard() {
  const { data: contactStats } = useQuery({
    queryKey: ['contacts', 'stats'],
    queryFn: () => contactsApi.getStats(),
  });

  const { data: campaignStats } = useQuery({
    queryKey: ['campaigns', 'stats'],
    queryFn: () => campaignsApi.getStats(),
  });

  const { data: callStats } = useQuery({
    queryKey: ['calls', 'stats'],
    queryFn: () => callsApi.getStats(),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => analyticsApi.getDashboard(),
  });

  const { data: recentCampaigns } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => campaignsApi.list({ pageSize: 5 }),
  });

  const stats = [
    {
      name: 'Total Contacts',
      value: contactStats?.data?.data?.total ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      link: '/contacts',
    },
    {
      name: 'Active Campaigns',
      value: campaignStats?.data?.data?.active ?? 0,
      icon: Megaphone,
      color: 'bg-green-500',
      link: '/campaigns',
    },
    {
      name: 'Calls Today',
      value: callStats?.data?.data?.callsToday ?? 0,
      icon: Phone,
      color: 'bg-purple-500',
      link: '/calls',
    },
    {
      name: 'Avg Call Duration',
      value: `${Math.round(callStats?.data?.data?.avgDuration ?? 0)}s`,
      icon: TrendingUp,
      color: 'bg-orange-500',
      link: '/analytics',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-3">
          <Link to="/contacts">
            <Button variant="secondary">Import Contacts</Button>
          </Link>
          <Link to="/campaigns">
            <Button>New Campaign</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            to={stat.link}
            className="overflow-hidden rounded-lg bg-white shadow transition-shadow hover:shadow-md"
          >
            <div className="p-5">
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
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Campaigns */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
            <Link to="/campaigns">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </div>
          <div className="space-y-4">
            {recentCampaigns?.data?.data?.length === 0 ? (
              <p className="text-sm text-gray-500">No campaigns yet</p>
            ) : (
              recentCampaigns?.data?.data?.map((campaign) => (
                <Link
                  key={campaign.id}
                  to={`/campaigns/${campaign.id}`}
                  className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {campaign.completedCalls} / {campaign.totalContacts} calls completed
                      </p>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  {campaign.status === 'IN_PROGRESS' && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-primary-500"
                          style={{
                            width: `${
                              campaign.totalContacts > 0
                                ? (campaign.completedCalls / campaign.totalContacts) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Sentiment Overview */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Call Sentiment</h2>
            <Link to="/analytics">
              <Button variant="ghost" size="sm">
                View analytics
              </Button>
            </Link>
          </div>
          {analyticsData?.data?.data?.dominantSentiment ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Overall Sentiment:</span>
                <SentimentBadge sentiment={analyticsData.data.data.dominantSentiment} />
              </div>
              <div className="space-y-2">
                {Object.entries(analyticsData.data.data.sentimentDistribution ?? {}).map(
                  ([sentiment, count]) => (
                    <div key={sentiment} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{sentiment.replace('_', ' ')}</span>
                      <span className="text-sm font-medium text-gray-900">{count as number}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No sentiment data yet. Complete some calls to see analytics.
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/contacts"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
          >
            <div className="rounded-lg bg-blue-100 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Import Contacts</h3>
              <p className="text-sm text-gray-500">Upload a CSV file</p>
            </div>
          </Link>
          <Link
            to="/campaigns"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
          >
            <div className="rounded-lg bg-green-100 p-2">
              <Megaphone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Create Campaign</h3>
              <p className="text-sm text-gray-500">Start a new call campaign</p>
            </div>
          </Link>
          <Link
            to="/calls"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
          >
            <div className="rounded-lg bg-purple-100 p-2">
              <Phone className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">View Calls</h3>
              <p className="text-sm text-gray-500">Check call history</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
