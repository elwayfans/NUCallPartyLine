import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pause, XCircle, Trash2, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, campaignsApi, contactsApi, type Campaign } from '../services/api';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { CampaignStatusBadge } from '../components/common/Badge';
import { useStore } from '../store';

export function Campaigns() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddContactsModal, setShowAddContactsModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
    refetchInterval: (query) => {
      const campaigns = query.state.data?.data?.data ?? [];
      const hasActive = campaigns.some((c: Campaign) => c.status === 'IN_PROGRESS');
      return hasActive ? 5000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => {
      toast.success('Campaign deleted');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete campaign');
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.start(id),
    onSuccess: () => {
      toast.success('Campaign started');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start campaign');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.pause(id),
    onSuccess: () => {
      toast.success('Campaign paused');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.cancel(id),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const campaigns = data?.data?.data ?? [];

  const handleCampaignCreated = (campaignId: string) => {
    setShowCreateModal(false);
    setSelectedCampaignId(campaignId);
    setShowAddContactsModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateModal(true)}
        >
          New Campaign
        </Button>
      </div>

      {/* Campaigns list */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No campaigns yet</p>
            <Button
              className="mt-4"
              onClick={() => setShowCreateModal(true)}
            >
              Create your first campaign
            </Button>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/campaigns/${campaign.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-gray-900">
                      {campaign.name}
                    </span>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  {campaign.description && (
                    <p className="mt-1 text-sm text-gray-500">{campaign.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-6 text-sm text-gray-600">
                    <span>
                      <strong>{campaign.totalContacts}</strong> contacts
                    </span>
                    <span>
                      <strong>{campaign.completedCalls}</strong> completed
                    </span>
                    <span>
                      <strong>{campaign.failedCalls}</strong> failed
                    </span>
                  </div>
                </div>

                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {campaign.status === 'DRAFT' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedCampaignId(campaign.id);
                          setShowAddContactsModal(true);
                        }}
                      >
                        Add Contacts
                      </Button>
                      <Button
                        size="sm"
                        leftIcon={<Play className="h-4 w-4" />}
                        onClick={() => startMutation.mutate(campaign.id)}
                        isLoading={startMutation.isPending}
                        disabled={campaign.totalContacts === 0}
                      >
                        Start
                      </Button>
                    </>
                  )}
                  {campaign.status === 'IN_PROGRESS' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Pause className="h-4 w-4" />}
                      onClick={() => pauseMutation.mutate(campaign.id)}
                    >
                      Pause
                    </Button>
                  )}
                  {campaign.status === 'PAUSED' && (
                    <Button
                      size="sm"
                      leftIcon={<Play className="h-4 w-4" />}
                      onClick={() => startMutation.mutate(campaign.id)}
                    >
                      Resume
                    </Button>
                  )}
                  {['DRAFT', 'IN_PROGRESS', 'PAUSED'].includes(campaign.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel this campaign?')) {
                          cancelMutation.mutate(campaign.id);
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                  {['DRAFT', 'COMPLETED', 'CANCELLED'].includes(campaign.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this campaign?')) {
                          deleteMutation.mutate(campaign.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress bar for active campaigns */}
              {['IN_PROGRESS', 'PAUSED'].includes(campaign.status) && campaign.totalContacts > 0 && (
                <div className="mt-4">
                  {campaign.status === 'IN_PROGRESS' && (() => {
                    const active = (campaign as any).campaignContacts ?? [];
                    return (
                      <div className="mb-2 flex items-center gap-2 text-sm text-primary-700">
                        <Phone className="h-3.5 w-3.5 animate-pulse" />
                        <span>
                          Calling{active.length > 0 && ': '}
                          {active.length > 0
                            ? active.map((cc: any) => `${cc.contact.firstName} ${cc.contact.lastName}`).join(', ')
                            : '...'
                          }
                          {' '}&mdash; {campaign.completedCalls + campaign.failedCalls} of {campaign.totalContacts} done
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span>
                      {Math.round(
                        ((campaign.completedCalls + campaign.failedCalls) /
                          campaign.totalContacts) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-primary-500 transition-all"
                      style={{
                        width: `${
                          ((campaign.completedCalls + campaign.failedCalls) /
                            campaign.totalContacts) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCampaignCreated}
      />

      {/* Add Contacts Modal */}
      <AddContactsModal
        isOpen={showAddContactsModal}
        onClose={() => setShowAddContactsModal(false)}
        campaignId={selectedCampaignId}
      />
    </div>
  );
}

// Create Campaign Modal Component
function CreateCampaignModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const queryClient = useQueryClient();

  // Fetch available assistants
  const { data: assistantsData } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants'),
    enabled: isOpen,
  });

  const assistants = assistantsData?.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; assistantId?: string }) =>
      campaignsApi.create(data),
    onSuccess: (response) => {
      toast.success('Campaign created');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setName('');
      setDescription('');
      setAssistantId('');
      onCreated(response.data.data.id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create campaign');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    if (!assistantId) {
      toast.error('Please select an assistant');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      assistantId,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Campaign">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Campaign Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Event Reminder Campaign"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Assistant *
          </label>
          <select
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select an assistant...</option>
            {assistants.map((assistant: { id: string; name: string; description?: string }) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.name} {assistant.description ? `- ${assistant.description}` : ''}
              </option>
            ))}
          </select>
          {assistants.length === 0 && (
            <p className="mt-1 text-sm text-amber-600">
              No assistants yet. Create one in the Assistants page first.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending} disabled={assistants.length === 0}>
            Create Campaign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Add Contacts Modal Component
function AddContactsModal({
  isOpen,
  onClose,
  campaignId,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string | null;
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
    mutationFn: (contactIds: string[]) =>
      campaignsApi.addContacts(campaignId!, contactIds),
    onSuccess: (response) => {
      toast.success(`Added ${response.data.data.added} contacts to campaign`);
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
