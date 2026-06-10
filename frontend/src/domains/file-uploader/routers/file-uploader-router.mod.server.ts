import { TRPCError } from "@trpc/server";
import * as z from "zod";

import { CONTENT_TYPE_HEADER } from "#/shared/constants/http/headers/headers.mod";
import { createURLSchema } from "#/shared/constants/schemas/schemas.mod.server";
import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

// Azure AI Foundry Project constants
const AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID = "prebuilt-invoice";
const AZURE_CONTENT_UNDERSTANDING_API_VERSION = "2025-11-01";

// Azure AI Foundry Project search params
const AZURE_CONTENT_UNDERSTANDING_API_VERSION_SEARCH_PARAM_NAME = "api-version";

// Azure AI Foundry Project headers
const AZURE_SUBSCRIPTION_KEY_HEADER_NAME = "Ocp-Apim-Subscription-Key";

/**
 * @see https://learn.microsoft.com/en-us/rest/api/contentunderstanding/content-analyzers/get-operation-status#operationstate
 */
const analysisStatusSchema = z.enum([
  "Canceled",
  "Failed",
  "NotStarted",
  "Running",
  "Succeeded",
]);

export type AnalysisStatus = z.output<typeof analysisStatusSchema>;

// =============================================================================
// ANALYSIS RESULT SCHEMA
// =============================================================================

/**
 * Represents the contents of an analysis result
 */
const contentsSchema = z.object({
  fields: z.nullish(z.record(z.string().trim(), z.unknown())),
});

export interface Contents extends z.output<typeof contentsSchema> {}

/**
 * Represents the result of an analysis
 */
const analysisResultSchema = z.object({
  analyzerId: z.literal(AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID),
  apiVersion: z.literal(AZURE_CONTENT_UNDERSTANDING_API_VERSION),
  contents: z.array(contentsSchema),
  createdAt: z.iso.datetime(),
  warnings: z.array(z.string().trim()),
});

export interface AnalysisResult extends z.output<typeof analysisResultSchema> {}

const startAnalysisInputsSchema = z.object({
  fileUrl: createURLSchema(),
});

const analysisResponseSchema = z.object({
  id: z.string().trim(),
  result: analysisResultSchema,
  status: analysisStatusSchema,
});

const getAnalysisResultInputsSchema = z.object({
  analysisId: z.string().trim().nonempty(),
});

function createAzureContentUnderstandingURL(
  pathname: string,
  endpoint: string,
) {
  const requestURL = new URL(pathname, endpoint);

  requestURL.searchParams.set(
    AZURE_CONTENT_UNDERSTANDING_API_VERSION_SEARCH_PARAM_NAME,
    AZURE_CONTENT_UNDERSTANDING_API_VERSION,
  );

  return requestURL;
}

async function parseAnalysisResponse(response: Response) {
  const validatedResponse = analysisResponseSchema.safeParse(
    await response.json(),
  );

  if (!validatedResponse.success) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "The response received from the upstream service was invalid.",
    });
  }

  return validatedResponse.data;
}

export const fileUploaderRouter = createTRPCRouter({
  startAnalysis: publicProcedure
    .input(startAnalysisInputsSchema)
    .mutation(async (opts) => {
      const { signal } = opts.ctx;

      const { fileUrl } = opts.input;

      const { env } = getApplicationBindings();

      const requestURL = createAzureContentUnderstandingURL(
        `/contentunderstanding/analyzers/${AZURE_CONTENT_UNDERSTANDING_ANALYZER_ID}:analyze`,
        env.AZURE_AI_ENDPOINT,
      );

      const requestBody = {
        inputs: [
          {
            url: fileUrl,
          },
        ],
      };

      const response = await fetch(requestURL, {
        body: JSON.stringify(requestBody),
        headers: {
          [AZURE_SUBSCRIPTION_KEY_HEADER_NAME]: env.AZURE_AI_API_KEY,
          [CONTENT_TYPE_HEADER]: "application/json",
        },
        method: "POST",
        signal,
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We were unable to analyze the file. Please try again later.",
        });
      }

      return parseAnalysisResponse(response);
    }),
  getAnalysisResult: publicProcedure
    .input(getAnalysisResultInputsSchema)
    .query(async (opts) => {
      const { signal } = opts.ctx;

      const { analysisId } = opts.input;

      const { env } = getApplicationBindings();

      const requestURL = createAzureContentUnderstandingURL(
        `/contentunderstanding/analyzerResults/${analysisId}`,
        env.AZURE_AI_ENDPOINT,
      );

      const response = await fetch(requestURL, {
        headers: {
          [AZURE_SUBSCRIPTION_KEY_HEADER_NAME]: env.AZURE_AI_API_KEY,
        },
        method: "GET",
        signal,
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "We were unable to get the analysis result. Please try again later.",
        });
      }

      return parseAnalysisResponse(response);
    }),
});
