import * as z from "zod";

import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";

const baseEnvSchema = z.object({
  // Clerk =====================================================================
  // CLERK_ACCOUNT_PORTAL_URL: createURLSchema(),
  // CLERK_PUBLISHABLE_KEY: z.string().trim().nonempty(),
  // CLERK_SECRET_KEY: z.string().trim().nonempty(),

  AZURE_AI_API_KEY: z.string().trim().nonempty(),
  AZURE_AI_REGION: z.string().trim().nonempty(),
  AZURE_AI_RESOURCE_ID: z.string().trim().nonempty(),

  CLOUDFLARE_AI_GATEWAY_URL: createURLSchema({
    hostname: /^gateway\.ai\.cloudflare\.com$/,
  }),

  DATABASE_URL: z.string().trim().nonempty(),

  OPENROUTER_API_KEY: z.string().trim().nonempty(),

  STORAGE_ACCESS_KEY_ID: z.string().trim().nonempty(),
  STORAGE_BUCKET: z.string().trim().nonempty(),
  STORAGE_ENDPOINT: createURLSchema(),
  STORAGE_REGION: z.string().trim().nonempty(),
  STORAGE_SECRET_ACCESS_KEY: z.string().trim().nonempty(),
});

const azureAIServiceURLSchema = createURLSchema({
  hostname: /-resource\.openai\.azure\.com$/,
});

export const envSchema = baseEnvSchema.transform((validatedEnv) => {
  const { AZURE_AI_RESOURCE_ID, ...restOfValidatedEnv } = validatedEnv;

  const validatedAzureAIEndpoint = azureAIServiceURLSchema.parse(
    `https://${AZURE_AI_RESOURCE_ID}-resource.openai.azure.com/`,
  );

  return {
    ...restOfValidatedEnv,
    AZURE_AI_ENDPOINT: validatedAzureAIEndpoint,
  };
});

export interface Env extends z.output<typeof envSchema> {}
