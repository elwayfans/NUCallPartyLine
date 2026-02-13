import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Button } from '../components/common/Button';
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

// API functions
const assistantsApi = {
  list: () => api.get<{ success: boolean; data: Assistant[] }>('/assistants'),
  delete: (id: string) => api.delete(`/assistants/${id}`),
};

export function Assistants() {
  const navigate = useNavigate();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assistants</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage call scripts with customizable voices and settings
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/assistants/new')}>
          New Assistant
        </Button>
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
            <Button className="mt-4" onClick={() => navigate('/assistants/new')}>
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
                      onClick={() => navigate(`/assistants/${assistant.id}`)}
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
    </div>
  );
}
