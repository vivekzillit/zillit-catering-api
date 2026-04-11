// Environment configuration — validated at boot so we fail fast if any
// required var is missing or malformed.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5174'),
  MONGO_URL: z.string().min(1, 'MONGO_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  AES_KEY: z
    .string()
    .length(32, 'AES_KEY must be exactly 32 UTF-8 bytes (iOS dev default: Yz2eI81ZLzCxJwf7BjTsMjyx-_PH5op=)'),
  AES_IV: z.string().length(16, 'AES_IV must be exactly 16 UTF-8 bytes'),
  MODULEDATA_MAX_SKEW_MS: z.coerce.number().int().positive().default(300_000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
