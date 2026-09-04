import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const runtimeEnvSchema = z.object({
  ADVANCED_PROVENANCE_ENABLED: booleanString.default(false),
  AI_ENABLED: booleanString.default(false),
  API_URL: z.string().url(),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(1),
  EXPERT_REVIEWS_ENABLED: booleanString.default(false),
  MARKETPLACE_ENABLED: booleanString.default(false),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PAYMENTS_ENABLED: booleanString.default(false),
  REDIS_URL: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PRIVATE: z.string().min(1),
  S3_BUCKET_PUBLIC: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_FORCE_PATH_STYLE: booleanString.default(true),
  S3_REGION: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(1)
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function loadRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  return runtimeEnvSchema.parse(source);
}

