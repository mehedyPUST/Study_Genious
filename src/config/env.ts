import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
    MONGODB_URI: z.string().url().default('mongodb://127.0.0.1:27017/studygenius_mock'),
    MONGODB_DB_NAME: z.string().default('studygenius'),
    JWT_ACCESS_SECRET: z.string().min(32).default('a_very_long_mock_access_token_secret_for_development'),
    JWT_REFRESH_SECRET: z.string().min(32).default('a_very_long_mock_refresh_token_secret_for_development'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GEMINI_API_KEY: z.string().default('mock_gemini_api_key'),
    USE_MOCK_AI: z.string().optional().default('false'),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    PORT: z.string().default('3000'),
});

const cleanEnv: Record<string, any> = {};
for (const key of Object.keys(process.env)) {
    const val = process.env[key];
    cleanEnv[key] = val === '' ? undefined : val;
}

const parsed = envSchema.safeParse(cleanEnv);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    // Print a fallback message and proceed with default data to avoid crashing the serverless runtime
    console.warn('⚠️ Proceeding with fallback config values.');
}

export const env = parsed.success ? parsed.data : envSchema.parse({});
