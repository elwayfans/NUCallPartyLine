import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Play, Loader2, Info, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import Vapi from '@vapi-ai/web';
import { api } from '../services/api';
import { Button } from '../components/common/Button';

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
  voicemailMessage?: string;
  isActive: boolean;
  createdAt: string;
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
  get: (id: string) => api.get<{ success: boolean; data: Assistant }>(`/assistants/${id}`),
  create: (data: Partial<Assistant>) => api.post<{ success: boolean; data: Assistant }>('/assistants', data),
  update: (id: string, data: Partial<Assistant>) => api.put<{ success: boolean; data: Assistant }>(`/assistants/${id}`, data),
  getModels: () => api.get<{ success: boolean; data: ModelProvider[] }>('/assistants/models'),
  getVoices: () => api.get<{ success: boolean; data: VoiceProvider[] }>('/assistants/voices'),
  previewVoice: (voiceId: string, voiceModel: string, text?: string) =>
    api.post<{ success: boolean; data: { audio: string; text: string } }>('/assistants/voices/preview', { voiceId, voiceModel, text }),
  testCall: (id: string, data: { phoneNumber: string; variables: Record<string, string>; inboundAssistantId?: string; notificationEmails?: string }) =>
    api.post<{ success: boolean; data: { message: string; callId: string; vapiCallId: string } }>(`/assistants/${id}/test-call`, data),
};

const DEFAULT_SYSTEM_PROMPT = `You are a friendly assistant calling on behalf of a university. You are reaching out to {{firstName}} to discuss important information.

Be polite, professional, and helpful. If they are not available, offer to call back later.

Key points to cover:
- Introduce yourself
- State the purpose of the call
- Answer any questions
- Thank them for their time`;

const DEFAULT_FIRST_MESSAGE = `Hi {{firstName}}, this is Sarah calling from the university. Do you have a moment to chat?`;

const DEFAULT_VOICEMAIL_MESSAGE = `Hi {{firstName}}, this is Chris calling from Neumont University. I'm reaching out because you previously showed interest in computer science and tech careers like AI or software engineering. I'd love to connect with you — please give us a call back at 487-444-5484. Thanks, and I look forward to speaking with you!`;

export function AssistantEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isEditing = id !== 'new';

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    firstMessage: DEFAULT_FIRST_MESSAGE,
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    voiceProvider: '11labs',
    voiceModel: 'eleven_turbo_v2_5',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    firstSpeaker: 'ASSISTANT' as 'ASSISTANT' | 'USER',
    voicemailMessage: DEFAULT_VOICEMAIL_MESSAGE,
  });

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [hasLoadedAssistant, setHasLoadedAssistant] = useState(false);

  // Test call state
  const [testVariables, setTestVariables] = useState({
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    phone: '555-123-4567',
    email: 'john.doe@example.com',
  });
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callTranscript, setCallTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const vapiRef = useRef<Vapi | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Inbound assistant for test call callbacks
  const [inboundAssistantId, setInboundAssistantId] = useState('');
  // Notification emails for appointment booking
  const [notificationEmails, setNotificationEmails] = useState('');

  // Phone test call state
  const [isPhoneCallLoading, setIsPhoneCallLoading] = useState(false);
  const [phoneCallResult, setPhoneCallResult] = useState<{ callId: string; vapiCallId: string } | null>(null);

  // Fetch existing assistant if editing
  const { data: assistantData, isLoading: isLoadingAssistant } = useQuery({
    queryKey: ['assistant', id],
    queryFn: () => assistantsApi.get(id!),
    enabled: isEditing,
  });

  // Fetch model providers
  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => assistantsApi.getModels(),
  });

  // Fetch voice providers
  const { data: voicesData } = useQuery({
    queryKey: ['voices'],
    queryFn: () => assistantsApi.getVoices(),
  });

  // Fetch all assistants for inbound callback picker
  const { data: allAssistantsData } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants'),
  });

  const modelProviders = modelsData?.data?.data ?? [];
  const voiceProviders = voicesData?.data?.data ?? [];

  // Get current provider's models/voices
  const currentModelProvider = modelProviders.find(p => p.id === formData.modelProvider);
  const currentVoiceProvider = voiceProviders.find(p => p.id === formData.voiceProvider);
  const availableModels = currentModelProvider?.models ?? [];
  const availableVoiceModels = currentVoiceProvider?.models ?? [];
  const availableVoices = currentVoiceProvider?.voices ?? [];

  // Load assistant data when editing
  useEffect(() => {
    if (assistantData?.data?.data) {
      const assistant = assistantData.data.data;
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
        voicemailMessage: assistant.voicemailMessage ?? DEFAULT_VOICEMAIL_MESSAGE,
      });
      setHasLoadedAssistant(true);
    }
  }, [assistantData]);

  // When model provider changes, select the first model (only if current model not in list)
  // For editing, wait until assistant data is loaded to avoid overwriting saved values
  useEffect(() => {
    if (isEditing && !hasLoadedAssistant) return;
    if (availableModels.length > 0 && !availableModels.find(m => m.id === formData.modelName)) {
      setFormData(prev => ({ ...prev, modelName: availableModels[0].id }));
    }
  }, [formData.modelProvider, availableModels, formData.modelName, isEditing, hasLoadedAssistant]);

  // When voice provider changes, select the first voice model and voice (only if current not in list)
  useEffect(() => {
    if (isEditing && !hasLoadedAssistant) return;
    if (availableVoiceModels.length > 0 && !availableVoiceModels.find(m => m.id === formData.voiceModel)) {
      setFormData(prev => ({ ...prev, voiceModel: availableVoiceModels[0].id }));
    }
  }, [formData.voiceProvider, availableVoiceModels, formData.voiceModel, isEditing, hasLoadedAssistant]);

  useEffect(() => {
    if (isEditing && !hasLoadedAssistant) return;
    if (availableVoices.length > 0 && !availableVoices.find(v => v.id === formData.voiceId)) {
      setFormData(prev => ({ ...prev, voiceId: availableVoices[0].id }));
    }
  }, [formData.voiceProvider, availableVoices, formData.voiceId, isEditing, hasLoadedAssistant]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [callTranscript]);

  // Cleanup VAPI on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
    };
  }, []);

  // Replace variables in text
  const replaceVariables = useCallback((text: string) => {
    let result = text;
    Object.entries(testVariables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  }, [testVariables]);

  const startTestCall = useCallback(async () => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      toast.error('VAPI Public Key not configured. Add VITE_VAPI_PUBLIC_KEY to your .env file.');
      return;
    }

    setIsCallConnecting(true);
    setCallTranscript([]);

    try {
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      // Set up event handlers
      vapi.on('call-start', () => {
        setIsCallConnecting(false);
        setIsCallActive(true);
        toast.success('Test call connected');
      });

      vapi.on('call-end', () => {
        setIsCallActive(false);
        setIsCallConnecting(false);
        setIsMuted(false);
        toast.success('Test call ended');
      });

      vapi.on('speech-start', () => {
        // Assistant started speaking
      });

      vapi.on('speech-end', () => {
        // Assistant stopped speaking
      });

      vapi.on('message', (message: { type: string; role?: string; transcript?: string }) => {
        if (message.type === 'transcript' && message.transcript) {
          setCallTranscript(prev => {
            // Update the last entry if it's the same role, otherwise add new
            const lastEntry = prev[prev.length - 1];
            if (lastEntry && lastEntry.role === message.role) {
              return [...prev.slice(0, -1), { role: message.role || 'unknown', text: message.transcript || '' }];
            }
            return [...prev, { role: message.role || 'unknown', text: message.transcript || '' }];
          });
        }
      });

      vapi.on('error', (error: Error) => {
        console.error('VAPI error:', error);
        toast.error('Call error: ' + error.message);
        setIsCallActive(false);
        setIsCallConnecting(false);
      });

      // Map voice provider to VAPI format
      const voiceProviderMap: Record<string, string> = {
        '11labs': '11labs',
        'playht': 'playht',
        'deepgram': 'deepgram',
        'azure': 'azure',
      };

      // Build assistant config with proper typing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assistantConfig: any = {
        model: {
          provider: formData.modelProvider,
          model: formData.modelName,
          messages: [
            {
              role: 'system',
              content: replaceVariables(formData.systemPrompt),
            },
          ],
        },
        voice: {
          provider: voiceProviderMap[formData.voiceProvider] || '11labs',
          voiceId: formData.voiceId,
          model: formData.voiceModel,
        },
        firstMessage: replaceVariables(formData.firstMessage),
        firstMessageMode: formData.firstSpeaker === 'ASSISTANT' ? 'assistant-speaks-first' : 'assistant-waits-for-user',
      };

      // Start the call with inline assistant configuration
      await vapi.start(assistantConfig);

    } catch (error) {
      console.error('Failed to start test call:', error);
      toast.error('Failed to start test call');
      setIsCallConnecting(false);
    }
  }, [formData, replaceVariables]);

  const endTestCall = useCallback(() => {
    if (vapiRef.current) {
      vapiRef.current.stop();
      vapiRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (vapiRef.current) {
      const newMuted = !isMuted;
      vapiRef.current.setMuted(newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const startPhoneTestCall = useCallback(async () => {
    if (!testVariables.phone.trim()) {
      toast.error('Please enter a phone number in the phone variable field');
      return;
    }
    if (!isEditing || !id) {
      toast.error('Please save the assistant first before making a phone test call');
      return;
    }

    setIsPhoneCallLoading(true);
    setPhoneCallResult(null);

    try {
      const response = await assistantsApi.testCall(id, {
        phoneNumber: testVariables.phone,
        variables: testVariables,
        inboundAssistantId: inboundAssistantId || undefined,
        notificationEmails: notificationEmails.trim() || undefined,
      });

      const data = response.data?.data;
      if (data) {
        setPhoneCallResult({ callId: data.callId, vapiCallId: data.vapiCallId });
        toast.success('Phone call initiated! The phone should ring shortly.');
      }
    } catch (error) {
      const err = error as Error & { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to initiate phone call');
    } finally {
      setIsPhoneCallLoading(false);
    }
  }, [testVariables, isEditing, id, inboundAssistantId, notificationEmails]);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => assistantsApi.create(data),
    onSuccess: () => {
      toast.success('Assistant created');
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
      navigate('/assistants');
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to create assistant');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => assistantsApi.update(id!, data),
    onSuccess: () => {
      toast.success('Assistant updated');
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
      queryClient.invalidateQueries({ queryKey: ['assistant', id] });
      navigate('/assistants');
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
        'The quiet sky burns bright with an eerie glow. Glancing upward, my friends and I see on the horizon the arrival of multiple star destroyers. Oh no... Scarif is under attack!'
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

  if (isEditing && isLoadingAssistant) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/assistants" className="hover:text-primary-600">
          Assistants
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900">
          {isEditing ? formData.name || 'Edit Assistant' : 'New Assistant'}
        </span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Assistant' : 'Create Assistant'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your AI assistant's personality, voice, and behavior
        </p>
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

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
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
        </div>

        {/* Language Model */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Language Model</h2>
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

        {/* Script */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Script</h2>
          <div className="space-y-4">
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
                rows={10}
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
                rows={3}
                placeholder="Hi {{firstName}}, this is..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
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

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Voicemail Message
              </label>
              <p className="text-xs text-gray-500 mb-1">
                Static message played when voicemail is detected. Supports {'{{variables}}'}. If blank, a default message is used.
              </p>
              <textarea
                value={formData.voicemailMessage}
                onChange={(e) => setFormData({ ...formData, voicemailMessage: e.target.value })}
                rows={4}
                placeholder={DEFAULT_VOICEMAIL_MESSAGE}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Voice Settings */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Voice Settings</h2>
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
                onClick={handlePreviewVoice}
                disabled={isPreviewLoading || formData.voiceProvider !== '11labs'}
                title={formData.voiceProvider !== '11labs' ? 'Preview only available for ElevenLabs' : 'Preview voice'}
              >
                {isPreviewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span className="ml-2">Preview</span>
              </Button>
            </div>
            {formData.voiceProvider !== '11labs' && (
              <p className="mt-2 text-xs text-gray-500">Voice preview is currently only available for ElevenLabs voices.</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/assistants')}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEditing ? 'Update Assistant' : 'Create Assistant'}
          </Button>
        </div>
      </form>

      {/* Test Call Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Test Call</h2>
        <p className="text-sm text-gray-500 mb-4">
          Test your assistant through your browser's microphone and speakers. Fill in the variable values below, then start the call.
        </p>

        {/* Variable Inputs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">firstName</label>
            <input
              type="text"
              value={testVariables.firstName}
              onChange={(e) => setTestVariables({ ...testVariables, firstName: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">lastName</label>
            <input
              type="text"
              value={testVariables.lastName}
              onChange={(e) => setTestVariables({ ...testVariables, lastName: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">fullName</label>
            <input
              type="text"
              value={testVariables.fullName}
              onChange={(e) => setTestVariables({ ...testVariables, fullName: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">phone</label>
            <input
              type="text"
              value={testVariables.phone}
              onChange={(e) => setTestVariables({ ...testVariables, phone: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">email</label>
            <input
              type="text"
              value={testVariables.email}
              onChange={(e) => setTestVariables({ ...testVariables, email: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Inbound Assistant for callbacks */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Inbound Assistant (for callbacks)</label>
          <select
            value={inboundAssistantId}
            onChange={(e) => setInboundAssistantId(e.target.value)}
            className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">None (generic prompt)</option>
            {(allAssistantsData?.data?.data ?? []).map((a: { id: string; name: string }) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">If the person calls back, this assistant handles the inbound call.</p>
        </div>

        {/* Notification Emails */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notification Emails</label>
          <input
            type="text"
            value={notificationEmails}
            onChange={(e) => setNotificationEmails(e.target.value)}
            placeholder="admissions@neumont.edu, recruiter@neumont.edu"
            className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="mt-1 text-xs text-gray-400">Comma-separated. Calendar invite sent when appointment is booked.</p>
        </div>

        {/* Call Controls */}
        <div className="flex items-center gap-3 mb-4">
          {!isCallActive && !isCallConnecting ? (
            <>
              <Button
                type="button"
                onClick={startTestCall}
                leftIcon={<Mic className="h-4 w-4" />}
              >
                Start Browser Call
              </Button>
              {isEditing && (
                <Button
                  type="button"
                  onClick={startPhoneTestCall}
                  isLoading={isPhoneCallLoading}
                  leftIcon={<Phone className="h-4 w-4" />}
                  disabled={!testVariables.phone.trim() || isPhoneCallLoading}
                >
                  Start Phone Call
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="danger"
                onClick={endTestCall}
                leftIcon={<PhoneOff className="h-4 w-4" />}
                disabled={isCallConnecting}
              >
                {isCallConnecting ? 'Connecting...' : 'End Call'}
              </Button>
              <Button
                type="button"
                variant={isMuted ? 'danger' : 'secondary'}
                onClick={toggleMute}
                disabled={isCallConnecting}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </>
          )}
          {isCallConnecting && (
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </span>
          )}
          {isCallActive && (
            <span className="flex items-center gap-2 text-sm text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Call Active
            </span>
          )}
        </div>

        {phoneCallResult && (
          <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
            Phone call initiated successfully. Call ID: {phoneCallResult.callId}
          </div>
        )}

        {/* Transcript */}
        {callTranscript.length > 0 && (
          <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 max-h-64 overflow-y-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Transcript</h3>
            <div className="space-y-2">
              {callTranscript.map((entry, index) => (
                <div
                  key={index}
                  className={`text-sm ${
                    entry.role === 'assistant'
                      ? 'text-primary-700 bg-primary-50 rounded px-2 py-1'
                      : 'text-gray-700 bg-white rounded px-2 py-1 border border-gray-200'
                  }`}
                >
                  <span className="font-medium capitalize">{entry.role}:</span> {entry.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
