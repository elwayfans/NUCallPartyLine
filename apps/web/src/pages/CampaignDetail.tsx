import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Pause, XCircle, Users, Plus, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, campaignsApi, contactsApi, callsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { CampaignStatusBadge, Badge } from '../components/common/Badge';
import { useStore } from '../store';

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddContactsModal, setShowAddContactsModal] = useState(false);

  const { data: campaignData, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(id!),
    enabled: !!id,
  });

  const { data: callsData } = useQuery({
    queryKey: ['calls', { campaignId: id }],
    queryFn: () => callsApi.list({ campaignId: id, pageSize: 50 }),
    enabled: !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => campaignsApi.start(id!),
    onSuccess: () => {
      toast.success('Campaign started');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start campaign');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => campaignsApi.pause(id!),
    onSuccess: () => {
      toast.success('Campaign paused');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => campaignsApi.cancel(id!),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => campaignsApi.reset(id!),
    onSuccess: () => {
      toast.success('Campaign reset to draft');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['calls', { campaignId: id }] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset campaign');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => campaignsApi.delete(id!),
    onSuccess: () => {
      toast.success('Campaign deleted');
      navigate('/campaigns');
    },
  });

  const campaign = campaignData?.data?.data;
  const isDraft = campaign?.status === 'DRAFT';

  const { data: assistantsData } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants'),
    enabled: isDraft,
  });

  const assistants: Array<{ id: string; name: string }> = assistantsData?.data?.data ?? [];

  const updateAssistantMutation = useMutation({
    mutationFn: (assistantId: string) => campaignsApi.update(id!, { assistantId } as any),
    onSuccess: () => {
      toast.success('Assistant updated');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update assistant');
    },
  });

  const removeContactsMutation = useMutation({
    mutationFn: (contactIds: string[]) => campaignsApi.removeContacts(id!, contactIds),
    onSuccess: () => {
      toast.success('Contact removed');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove contact');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const calls = callsData?.data?.data ?? [];

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Campaign not found</p>
        <Link to="/campaigns" className="text-primary-600 hover:underline mt-2 inline-block">
          Back to campaigns
        </Link>
      </div>
    );
  }

  const progress = campaign.totalContacts > 0
    ? Math.round(((campaign.completedCalls + campaign.failedCalls) / campaign.totalContacts) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/campaigns"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="mt-1 text-gray-500">{campaign.description}</p>
          )}
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-gray-500">Assistant:</span>
            {isDraft ? (
              <select
                value={campaign.assistantId ?? ''}
                onChange={(e) => {
                  if (e.target.value) updateAssistantMutation.mutate(e.target.value);
                }}
                className="rounded border border-gray-300 px-2 py-0.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {!campaign.assistantId && <option value="">Not set</option>}
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <span className="font-medium text-gray-700">
                {campaign.assistant?.name ?? 'Not set'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'DRAFT' && (
            <>
              <Button
                variant="secondary"
                leftIcon={<Users className="h-4 w-4" />}
                onClick={() => setShowAddContactsModal(true)}
              >
                Add Contacts
              </Button>
              <Button
                leftIcon={<Play className="h-4 w-4" />}
                onClick={() => startMutation.mutate()}
                isLoading={startMutation.isPending}
                disabled={campaign.totalContacts === 0}
              >
                Start Campaign
              </Button>
            </>
          )}
          {campaign.status === 'IN_PROGRESS' && (
            <Button
              variant="secondary"
              leftIcon={<Pause className="h-4 w-4" />}
              onClick={() => pauseMutation.mutate()}
            >
              Pause
            </Button>
          )}
          {campaign.status === 'PAUSED' && (
            <Button
              leftIcon={<Play className="h-4 w-4" />}
              onClick={() => startMutation.mutate()}
            >
              Resume
            </Button>
          )}
          {['DRAFT', 'IN_PROGRESS', 'PAUSED'].includes(campaign.status) && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Are you sure you want to cancel this campaign?')) {
                  cancelMutation.mutate();
                }
              }}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          {campaign.status !== 'DRAFT' && (
            <Button
              variant="secondary"
              leftIcon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                if (confirm('Reset this campaign to draft? This will delete all call records and reset contacts to pending.')) {
                  resetMutation.mutate();
                }
              }}
              isLoading={resetMutation.isPending}
            >
              Reset
            </Button>
          )}
          {['DRAFT', 'COMPLETED', 'CANCELLED'].includes(campaign.status) && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Are you sure you want to delete this campaign?')) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Contacts</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{campaign.totalContacts}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">{campaign.completedCalls}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{campaign.failedCalls}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Progress</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{progress}%</p>
        </div>
      </div>

      {/* Progress bar */}
      {campaign.totalContacts > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>Campaign Progress</span>
            <span>{campaign.completedCalls + campaign.failedCalls} / {campaign.totalContacts} calls</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-primary-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Contacts */}
      {campaign.campaignContacts && campaign.campaignContacts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-900">
              Contacts ({campaign.campaignContacts.length})
            </h2>
            {isDraft && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Users className="h-4 w-4" />}
                onClick={() => setShowAddContactsModal(true)}
              >
                Add More
              </Button>
            )}
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                {isDraft && (
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {campaign.campaignContacts.map((cc: any) => (
                <tr key={cc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {cc.contact.firstName} {cc.contact.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{cc.contact.phoneNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{cc.contact.email ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={
                      cc.status === 'COMPLETED' ? 'success' :
                      cc.status === 'FAILED' ? 'error' :
                      cc.status === 'IN_PROGRESS' ? 'warning' : 'default'
                    }>
                      {cc.status}
                    </Badge>
                  </td>
                  {isDraft && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeContactsMutation.mutate([cc.contact.id])}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Calls list */}
      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Call History</h2>
        </div>
        {calls.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No calls yet. {campaign.status === 'DRAFT' && 'Start the campaign to begin making calls.'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Duration</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/calls/${call.id}`}
                      className="font-medium text-gray-900 hover:text-primary-600"
                    >
                      {call.contact?.firstName} {call.contact?.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{call.phoneNumber}</td>
                  <td className="px-4 py-3">
                    <CallStatusBadge status={call.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Contacts Modal */}
      <AddContactsModal
        isOpen={showAddContactsModal}
        onClose={() => setShowAddContactsModal(false)}
        campaignId={id!}
      />
    </div>
  );
}

function CallStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    COMPLETED: 'success',
    IN_PROGRESS: 'warning',
    RINGING: 'warning',
    QUEUED: 'default',
    SCHEDULED: 'default',
    FAILED: 'error',
    NO_ANSWER: 'error',
    BUSY: 'error',
    CANCELLED: 'default',
  };
  return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
}

function AddContactsModal({
  isOpen,
  onClose,
  campaignId,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const queryClient = useQueryClient();
  const { selectedContactIds, toggleContactSelection, clearContactSelection } = useStore();

  const { data: batchesData } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => contactsApi.listImportBatches(),
    enabled: isOpen,
  });

  const batches: Array<{ id: string; name: string; successCount: number }> = batchesData?.data?.data ?? [];

  const { data: contactsData, isLoading } = useQuery({
    queryKey: ['contacts', { search, batchFilter, pageSize: 100 }],
    queryFn: () => contactsApi.list({ pageSize: 100, search: search || undefined, importBatchId: batchFilter || undefined }),
    enabled: isOpen,
  });

  const addContactsMutation = useMutation({
    mutationFn: (contactIds: string[]) => campaignsApi.addContacts(campaignId, contactIds),
    onSuccess: (response) => {
      toast.success(`Added ${response.data.data.added} contacts to campaign`);
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      clearContactSelection();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add contacts');
    },
  });

  const contacts = contactsData?.data?.data ?? [];

  const handleAdd = () => {
    if (selectedContactIds.size === 0) {
      toast.error('Select at least one contact');
      return;
    }
    addContactsMutation.mutate(Array.from(selectedContactIds));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Contacts to Campaign" size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {batches.length > 0 && (
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.successCount})</option>
              ))}
            </select>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-gray-500">Loading...</p>
          ) : contacts.length === 0 ? (
            <p className="py-4 text-center text-gray-500">No contacts found</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <label
                  key={contact.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedContactIds.has(contact.id)
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedContactIds.has(contact.id)}
                    onChange={() => toggleContactSelection(contact.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{contact.phoneNumber}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-600">
            {selectedContactIds.size} contacts selected
          </span>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              isLoading={addContactsMutation.isPending}
              disabled={selectedContactIds.size === 0}
            >
              Add to Campaign
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
