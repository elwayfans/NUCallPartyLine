import { Router } from 'express';
import { z } from 'zod';
import { assistantsService } from '../services/assistants.service.js';
import { vapiService } from '../services/vapi.service.js';
import { env } from '../config/env.js';
import { successResponse, errorResponse, paginatedResponse, getPaginationParams } from '../utils/response.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phone-formatter.js';

const router = Router();

// Validation schemas
const createAssistantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  firstMessage: z.string().optional(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  voiceProvider: z.string().optional(),
  voiceModel: z.string().optional(),
  voiceId: z.string().optional(),
  firstSpeaker: z.enum(['ASSISTANT', 'USER']).optional(),
});

const updateAssistantSchema = createAssistantSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /api/assistants - List assistants
router.get('/', async (req, res, next) => {
  try {
    const pagination = getPaginationParams(req.query as { page?: string; pageSize?: string });
    const filters = {
      search: req.query.search as string | undefined,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    };

    const result = await assistantsService.findAll(filters, pagination);

    if (result.pagination) {
      paginatedResponse(res, result.data, result.pagination);
    } else {
      successResponse(res, result.data);
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/assistants/models - Get available LLM providers and models
router.get('/models', (_req, res) => {
  const providers = [
    {
      id: 'openai',
      name: 'OpenAI',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, best for complex tasks' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and cost-effective (Recommended)' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation, still powerful' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fastest, most economical' },
      ],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Balanced performance and speed' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable Claude model' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest Claude model' },
      ],
    },
    {
      id: 'groq',
      name: 'Groq',
      models: [
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', description: 'Fast open-source model' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Ultra-fast, lightweight' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Balanced MoE model' },
      ],
    },
  ];
  successResponse(res, providers);
});

// Voice models for each provider
const voiceModels = {
  '11labs': [
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Fastest, low latency (Recommended)' },
    { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Fast, optimized for real-time' },
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5', description: 'Ultra-fast, newest flash model' },
    { id: 'eleven_flash_v2', name: 'Flash v2', description: 'Ultra-fast streaming' },
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Best quality, 29 languages' },
    { id: 'eleven_monolingual_v1', name: 'Monolingual v1', description: 'English only, legacy' },
  ],
  'playht': [
    { id: 'PlayHT2.0-turbo', name: 'PlayHT 2.0 Turbo', description: 'Fast, conversational' },
    { id: 'PlayHT2.0', name: 'PlayHT 2.0', description: 'High quality' },
  ],
  'deepgram': [
    { id: 'aura', name: 'Aura', description: 'Real-time text-to-speech' },
  ],
  'azure': [
    { id: 'azure', name: 'Azure Neural', description: 'Microsoft neural voices' },
  ],
};

// Fallback voices for non-ElevenLabs providers
const fallbackVoices = {
  'playht': [
    { id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json', name: 'Jennifer', description: 'Professional female' },
    { id: 's3://voice-cloning-zero-shot/801a663f-efd0-4254-98d0-5c175514c3e8/male-cs/manifest.json', name: 'Michael', description: 'Professional male' },
  ],
  'deepgram': [
    { id: 'aura-asteria-en', name: 'Asteria', description: 'Professional female' },
    { id: 'aura-luna-en', name: 'Luna', description: 'Warm female' },
    { id: 'aura-stella-en', name: 'Stella', description: 'Confident female' },
    { id: 'aura-athena-en', name: 'Athena', description: 'Authoritative female' },
    { id: 'aura-hera-en', name: 'Hera', description: 'Calm female' },
    { id: 'aura-orion-en', name: 'Orion', description: 'Deep male' },
    { id: 'aura-arcas-en', name: 'Arcas', description: 'Friendly male' },
    { id: 'aura-perseus-en', name: 'Perseus', description: 'Professional male' },
    { id: 'aura-angus-en', name: 'Angus', description: 'Irish male' },
    { id: 'aura-orpheus-en', name: 'Orpheus', description: 'Warm male' },
    { id: 'aura-helios-en', name: 'Helios', description: 'British male' },
    { id: 'aura-zeus-en', name: 'Zeus', description: 'Authoritative male' },
  ],
  'azure': [
    { id: 'en-US-JennyNeural', name: 'Jenny', description: 'American female' },
    { id: 'en-US-GuyNeural', name: 'Guy', description: 'American male' },
    { id: 'en-US-AriaNeural', name: 'Aria', description: 'American female (expressive)' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia', description: 'British female' },
    { id: 'en-GB-RyanNeural', name: 'Ryan', description: 'British male' },
  ],
};

// GET /api/assistants/voices - Get available voice providers, models, and voices
router.get('/voices', async (req, res, next) => {
  try {
    const provider = req.query.provider as string | undefined;

    // For ElevenLabs, fetch voices from their API (includes preview_url)
    let elevenLabsVoices: { id: string; name: string; description: string; preview_url?: string }[] = [];
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'xi-api-key': apiKey,
          },
        });

        if (response.ok) {
          const data = await response.json() as { voices: Array<{
            voice_id: string;
            name: string;
            labels?: { gender?: string; accent?: string; description?: string };
            preview_url?: string;
          }> };
          elevenLabsVoices = data.voices.map((voice) => ({
            id: voice.voice_id,
            name: voice.name,
            description: voice.labels?.description || `${voice.labels?.gender || ''} ${voice.labels?.accent || ''}`.trim() || 'ElevenLabs voice',
            preview_url: voice.preview_url,
          }));
        }
      } catch {
        // Fall back to hardcoded list if API fails
        console.error('Failed to fetch ElevenLabs voices, using fallback');
      }
    }

    // Fallback ElevenLabs voices if API call fails or no API key
    if (elevenLabsVoices.length === 0) {
      elevenLabsVoices = [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, professional female' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Confident, authoritative female' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'Soft, warm female' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Friendly, conversational male' },
        { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'Youthful, enthusiastic female' },
        { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', description: 'Deep, professional male' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Authoritative, deep male' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Clear, neutral male' },
        { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'Smooth, warm male' },
      ];
    }

    const voiceProviders = {
      '11labs': {
        id: '11labs',
        name: 'ElevenLabs',
        models: voiceModels['11labs'],
        voices: elevenLabsVoices,
      },
      'playht': {
        id: 'playht',
        name: 'PlayHT',
        models: voiceModels['playht'],
        voices: fallbackVoices['playht'],
      },
      'deepgram': {
        id: 'deepgram',
        name: 'Deepgram',
        models: voiceModels['deepgram'],
        voices: fallbackVoices['deepgram'],
      },
      'azure': {
        id: 'azure',
        name: 'Azure',
        models: voiceModels['azure'],
        voices: fallbackVoices['azure'],
      },
    };

    if (provider && voiceProviders[provider as keyof typeof voiceProviders]) {
      successResponse(res, voiceProviders[provider as keyof typeof voiceProviders]);
    } else {
      // Return all providers
      successResponse(res, Object.values(voiceProviders));
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/assistants/voices/preview - Generate TTS preview
router.post('/voices/preview', async (req, res, next) => {
  try {
    const { voiceId, voiceModel, text } = req.body as {
      voiceId: string;
      voiceModel?: string;
      text?: string;
    };

    if (!voiceId) {
      return errorResponse(res, 'voiceId is required', 400);
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return errorResponse(res, 'ElevenLabs API key not configured', 500);
    }

    const previewText = text || 'Oh no... Scarif is under attack!';
    const model = voiceModel || 'eleven_turbo_v2_5';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: previewText,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs TTS error:', error);
      return errorResponse(res, 'Failed to generate voice preview', response.status);
    }

    // Get the audio buffer and convert to base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`;

    successResponse(res, { audio: audioDataUrl, text: previewText });
  } catch (error) {
    next(error);
  }
});

// POST /api/assistants/:id/test-call - Make a real outbound test call
const testCallSchema = z.object({
  phoneNumber: z.string().min(1, 'Phone number is required'),
  variables: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

router.post('/:id/test-call', async (req, res, next) => {
  try {
    const { phoneNumber: rawPhone, variables } = testCallSchema.parse(req.body);

    // Normalize to E.164 format
    const phoneNumber = normalizePhoneNumber(rawPhone);
    if (!isValidPhoneNumber(phoneNumber)) {
      return errorResponse(res, `Invalid phone number: "${rawPhone}". Use E.164 format (e.g. +15551234567) or a 10-digit US number.`, 400);
    }

    // Resolve VAPI phone number ID — look it up from VAPI if not a UUID
    let phoneNumberId = env.VAPI_PHONE_NUMBER_ID;
    if (!phoneNumberId || !/^[0-9a-f-]{36}$/i.test(phoneNumberId)) {
      // Not a UUID — try to find it from VAPI's phone number list
      const phoneNumbers = await vapiService.listPhoneNumbers();
      const match = phoneNumbers.find(pn => pn.number === normalizePhoneNumber(phoneNumberId ?? ''));
      if (match) {
        phoneNumberId = match.id;
      } else if (phoneNumbers.length > 0) {
        phoneNumberId = phoneNumbers[0].id;
      } else {
        return errorResponse(res, 'No phone numbers found in your VAPI account. Add one at dashboard.vapi.ai.', 500);
      }
    }

    // Build inline assistant config with variable substitution
    const assistantConfig = await assistantsService.getCallConfig(req.params.id, {
      firstName: variables?.firstName,
      lastName: variables?.lastName,
      fullName: variables?.fullName,
      phoneNumber: variables?.phone ?? phoneNumber,
      email: variables?.email,
    });

    // Create the test call via VAPI with inline config
    const result = await vapiService.createTestCall({
      assistantId: req.params.id,
      phoneNumber,
      phoneNumberId,
      assistantConfig: assistantConfig as Record<string, unknown>,
    });

    successResponse(res, {
      message: 'Test call initiated',
      callId: result.callId,
      vapiCallId: result.vapiCallId,
    }, 201);
  } catch (error) {
    next(error);
  }
});

// GET /api/assistants/:id - Get single assistant
router.get('/:id', async (req, res, next) => {
  try {
    const assistant = await assistantsService.findById(req.params.id);
    if (!assistant) {
      return errorResponse(res, 'Assistant not found', 404);
    }
    successResponse(res, assistant);
  } catch (error) {
    next(error);
  }
});

// POST /api/assistants - Create assistant
router.post('/', async (req, res, next) => {
  try {
    const data = createAssistantSchema.parse(req.body);
    const assistant = await assistantsService.create(data);
    successResponse(res, assistant, 201);
  } catch (error) {
    next(error);
  }
});

// PUT /api/assistants/:id - Update assistant
router.put('/:id', async (req, res, next) => {
  try {
    const data = updateAssistantSchema.parse(req.body);
    const assistant = await assistantsService.update(req.params.id, data);
    successResponse(res, assistant);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/assistants/:id - Delete assistant
router.delete('/:id', async (req, res, next) => {
  try {
    await assistantsService.delete(req.params.id);
    successResponse(res, { message: 'Assistant deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
