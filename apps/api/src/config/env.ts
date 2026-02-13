import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (two levels up from src/config/)
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),

  // VAPI
  VAPI_API_KEY: z.string().min(1),
  VAPI_ASSISTANT_ID: z.string().min(1),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // Security
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Limits
  MAX_CONCURRENT_CALLS: z.coerce.number().default(10),
  CALL_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(30),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
