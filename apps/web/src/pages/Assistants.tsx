import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Bot, Info, Play, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';

interface Assistant {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  firstMessage?: string;
  modelProvider: string;
  modelName: string;
  voiceProvider: string;
  voiceModel: string;
  voiceId: string;
  firstSpeaker: 'ASSISTANT' | 'USER';
  isActive: boolean;
  createdAt: string;
  _count?: { campaigns: number };
}

interface ModelProvider {
  id: string;
  name: string;
  models: { id: string; name: string; description: string }[];
}

interface VoiceProvider {
  id: string;
  name: string;
  models: { id: string; name: string; description: string }[];
  voices: { id: string; name: string; description: string; preview_url?: string }[];
}

// API functions
const assistantsApi = {
  list: () => api.get<{ success: boolean; data: Assistant[] }>('/assistants'),
  get: (id: string) => api.get<{ success: boolean; data: Assistant }>(`/assistants/${id}`),
  create: (data: Partial<Assistant>) => api.post<{ success: boolean; data: Assistant }>('/assistants', data),
  update: (id: string, data: Partial<Assistant>) => api.put<{ success: boolean; data: Assistant }>(`/assistants/${id}`, data),
  delete: (id: string) => api.delete(`/assistants/${id}`),
  getModels: () => api.get<{ success: boolean; data: ModelProvider[] }>('/assistants/models'),
  getVoices: () => api.get<{ success: boolean; data: VoiceProvider[] }>('/assistants/voices'),
  previewVoice: (voiceId: string, voiceModel: string, text?: string) =>
    api.post<{ success: boolean; data: { audio: string; text: string } }>('/assistants/voices/preview', { voiceId, voiceModel, text }),
};

export function Assistants() {
  const [showModal, setShowModal] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => assistantsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assistantsApi.delete(id),
    onSuccess: () => {
      toast.success('Assistant deleted');
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to delete assistant');
    },
  });

  const assistants = data?.data?.data ?? [];

  const handleEdit = (assistant: Assistant) => {
    setEditingAssistant(assistant);
    setShowModal(true);
  };

  const handleCreate = () => {
    setEditingAssistant(null);
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingAssistant(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assistants</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage call scripts with customizable voices and settings
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleCreate}>
          New Assistant
        </Button>
      </div>

      {/* Variable reference */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Available Variables</p>
            <p className="mt-1 text-sm text-blue-700">
              Use these in your script and they'll be replaced with contact data:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <code className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">{'{{firstName}}'}</code>
              <code className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">{'{{lastName}}'}</code>
              <code className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">{'{{fullName}}'}</code>
              <code className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">{'{{phone}}'}</code>
              <code className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">{'{{email}}'}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Assistants list */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : assistants.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <Bot className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-gray-500">No assistants yet</p>
            <Button className="mt-4" onClick={handleCreate}>
              Create your first assistant
            </Button>
          </div>
        ) : (
          assistants.map((assistant) => (
            <div
              key={assistant.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-primary-500" />
                    <button
                      onClick={() => handleEdit(assistant)}
                      className="font-semibold text-gray-900 hover:text-primary-600 text-left"
                    >
                      {assistant.name}
                    </button>
                    <Badge variant={assistant.isActive ? 'success' : 'default'}>
                      {assistant.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {assistant.description && (
                    <p className="mt-1 text-sm text-gray-500">{assistant.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                    <span>
                      Model: <strong>{assistant.modelProvider}/{assistant.modelName}</strong>
                    </span>
                    <span>
                      Voice: <strong>{assistant.voiceProvider}</strong>
                    </span>
                    <span>
                      First Speaker: <strong>{assistant.firstSpeaker === 'ASSISTANT' ? 'Assistant' : 'User'}</strong>
                    </span>
                    {assistant._count && (
                      <span>
                        Used in <strong>{assistant._count.campaigns}</strong> campaigns
                      </span>
                    )}
                  </div>
                  {assistant.firstMessage && (
                    <div className="mt-3 rounded bg-gray-50 p-3">
                      <p className="text-xs font-medium text-gray-500 uppercase">First Message</p>
                      <p className="mt-1 text-sm text-gray-700 line-clamp-2">{assistant.firstMessage}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this assistant?')) {
                        deleteMutation.mutate(assistant.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      <AssistantModal
        isOpen={showModal}
        onClose={handleClose}
        assistant={editingAssistant}
      />
    </div>
  );
}

function AssistantModal({
  isOpen,
  onClose,
  assistant,
}: {
  isOpen: boolean;
  onClose: () => void;
  assistant: Assistant | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!assistant;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: `You are a friendly assistant calling on behalf of a university. You are reaching out to {{firstName}} to discuss important information.

Be polite, professional, and helpful. If they are not available, offer to call back later.

Key points to cover:
- Introduce yourself
- State the purpose of the call
- Answer any questions
- Thank them for their time`,
    firstMessage: `Hi {{firstName}}, this is Sarah calling from the university. Do you have a moment to chat?`,
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    voiceProvider: '11labs',
    voiceModel: 'eleven_turbo_v2_5',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    firstSpeaker: 'ASSISTANT' as 'ASSISTANT' | 'USER',
  });

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Fetch model providers
  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => assistantsApi.getModels(),
    enabled: isOpen,
  });

  // Fetch voice providers
  const { data: voicesData } = useQuery({
    queryKey: ['voices'],
    queryFn: () => assistantsApi.getVoices(),
    enabled: isOpen,
  });

  const modelProviders = modelsData?.data?.data ?? [];
  const voiceProviders = voicesData?.data?.data ?? [];

  // Get current provider's models/voices
  const currentModelProvider = modelProviders.find(p => p.id === formData.modelProvider);
  const currentVoiceProvider = voiceProviders.find(p => p.id === formData.voiceProvider);
  const availableModels = currentModelProvider?.models ?? [];
  const availableVoiceModels = currentVoiceProvider?.models ?? [];
  const availableVoices = currentVoiceProvider?.voices ?? [];

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (assistant) {
        setFormData({
          name: assistant.name,
          description: assistant.description ?? '',
          systemPrompt: assistant.systemPrompt,
          firstMessage: assistant.firstMessage ?? '',
          modelProvider: assistant.modelProvider || 'openai',
          modelName: assistant.modelName || 'gpt-4o-mini',
          voiceProvider: assistant.voiceProvider || '11labs',
          voiceModel: assistant.voiceModel || 'eleven_turbo_v2_5',
          voiceId: assistant.voiceId,
          firstSpeaker: assistant.firstSpeaker,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          systemPrompt: `You are a friendly assistant calling on behalf of a university. You are reaching out to {{firstName}} to discuss important information.

Be polite, professional, and helpful. If they are not available, offer to call back later.

Key points to cover:
- Introduce yourself
- State the purpose of the call
- Answer any questions
- Thank them for their time`,
          firstMessage: `Hi {{firstName}}, this is Sarah calling from the university. Do you have a moment to chat?`,
          modelProvider: 'openai',
          modelName: 'gpt-4o-mini',
          voiceProvider: '11labs',
          voiceModel: 'eleven_turbo_v2_5',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          firstSpeaker: 'ASSISTANT',
        });
      }
    }
  }, [isOpen, assistant]);

  // When model provider changes, select the first model
  useEffect(() => {
    if (availableModels.length > 0 && !availableModels.find(m => m.id === formData.modelName)) {
      setFormData(prev => ({ ...prev, modelName: availableModels[0].id }));
    }
  }, [formData.modelProvider, availableModels, formData.modelName]);

  // When voice provider changes, select the first voice model and voice
  useEffect(() => {
    if (availableVoiceModels.length > 0 && !availableVoiceModels.find(m => m.id === formData.voiceModel)) {
      setFormData(prev => ({ ...prev, voiceModel: availableVoiceModels[0].id }));
    }
  }, [formData.voiceProvider, availableVoiceModels, formData.voiceModel]);

  useEffect(() => {
    if (availableVoices.length > 0 && !availableVoices.find(v => v.id === formData.voiceId)) {
      setFormData(prev => ({ ...prev, voiceId: availableVoices[0].id }));
    }
  }, [formData.voiceProvider, availableVoices, formData.voiceId]);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => assistantsApi.create(data),
    onSuccess: () => {
      toast.success('Assistant created');
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
      onClose();
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to create assistant');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => assistantsApi.update(assistant!.id, data),
    onSuccess: () => {
      toast.success('Assistant updated');
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
      onClose();
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to update assistant');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.systemPrompt.trim()) {
      toast.error('System prompt is required');
      return;
    }

    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handlePreviewVoice = async () => {
    if (!formData.voiceId) {
      toast.error('Please select a voice first');
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setIsPreviewLoading(true);

    try {
      const response = await assistantsApi.previewVoice(
        formData.voiceId,
        formData.voiceModel,
        'The quiet sky burns bright with an eerie glow.  Glancing upward, my friends and I see on the horizon the arrival of multiple star destroyers.  Oh no... Scarif is under attack!'
      );
      const audioData = response.data?.data?.audio;

      if (audioData) {
        const audio = new Audio(audioData);
        audioRef.current = audio;

        audio.onended = () => setIsPreviewLoading(false);
        audio.onerror = () => {
          toast.error('Failed to play voice preview');
          setIsPreviewLoading(false);
        };

        await audio.play();
      }
    } catch (error) {
      const err = error as Error & { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to preview voice');
      setIsPreviewLoading(false);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Assistant' : 'Create Assistant'}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Event Reminder Bot"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this assistant"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* LLM Settings */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Language Model</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Provider
              </label>
              <select
                value={formData.modelProvider}
                onChange={(e) => setFormData({ ...formData, modelProvider: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {modelProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Model
              </label>
              <select
                value={formData.modelName}
                onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            System Prompt <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-1">
            The instructions for the AI. Use {'{{firstName}}'}, {'{{lastName}}'}, etc. for personalization.
          </p>
          <textarea
            value={formData.systemPrompt}
            onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
            rows={8}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            First Message
          </label>
          <p className="text-xs text-gray-500 mb-1">
            What the assistant says first (if assistant speaks first)
          </p>
          <textarea
            value={formData.firstMessage}
            onChange={(e) => setFormData({ ...formData, firstMessage: e.target.value })}
            rows={2}
            placeholder="Hi {{firstName}}, this is..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Voice Settings */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Voice Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Voice Provider
              </label>
              <select
                value={formData.voiceProvider}
                onChange={(e) => setFormData({ ...formData, voiceProvider: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {voiceProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Voice Model
              </label>
              <select
                value={formData.voiceModel}
                onChange={(e) => setFormData({ ...formData, voiceModel: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {availableVoiceModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              Voice
            </label>
            <div className="mt-1 flex gap-2">
              <select
                value={formData.voiceId}
                onChange={(e) => setFormData({ ...formData, voiceId: e.target.value })}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {availableVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePreviewVoice}
                disabled={isPreviewLoading || formData.voiceProvider !== '11labs'}
                title={formData.voiceProvider !== '11labs' ? 'Preview only available for ElevenLabs' : 'Preview voice'}
              >
                {isPreviewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          {formData.voiceProvider !== '11labs' && (
            <p className="mt-2 text-xs text-gray-500">Voice preview is currently only available for ElevenLabs voices.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Who Speaks First
          </label>
          <select
            value={formData.firstSpeaker}
            onChange={(e) => setFormData({ ...formData, firstSpeaker: e.target.value as 'ASSISTANT' | 'USER' })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="ASSISTANT">Assistant speaks first</option>
            <option value="USER">Wait for user to speak</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEditing ? 'Update Assistant' : 'Create Assistant'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
