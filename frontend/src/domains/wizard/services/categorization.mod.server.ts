/**
 * AI-powered document categorization via OpenRouter + Cloudflare AI Gateway.
 *
 * Uses vision capabilities to classify uploaded documents (images/PDFs) into
 * El Salvador DTE-aligned categories: invoice, receipt, or purchase_order.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { FilePart, ImagePart } from "ai";
import { generateText, Output } from "ai";
import * as z from "zod";

import type { UploadableMimeType } from "#/domains/wizard/constants/wizard.mod";
import { UPLOADABLE_MIME_TYPES } from "#/domains/wizard/constants/wizard.mod";
import type { DocumentCategory } from "#/shared/db/db.schema.server";
import { documentCategoryEnum } from "#/shared/db/db.schema.server";

export const CATEGORIZATION_MODEL = "google/gemma-4-26b-a4b-it";

const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

const categorizationSchema = z.object({
  category: z.enum(documentCategoryEnum.enumValues).meta({
    description: "The category of the document",
  }),
  confidence: z.number().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX).meta({
    description:
      "The confidence score of the document classification. A value between 0 and 1. 0 means low confidence, 1 means high confidence.",
  }),
});

export const CATEGORIZATION_SYSTEM_PROMPT = `You are a document classification specialist for El Salvador's tax and commercial document system.

Classify the provided document into exactly one of these categories:

- "invoice": Facturas de Consumidor Final (FCF), Comprobantes de Crédito Fiscal (CCF), Facturas de Exportación, Notas de Crédito/Débito, or any Documento Tributario Electrónico (DTE) issued under Ministerio de Hacienda (MH) regulations that represents a billing or tax credit document.
- "receipt": Recibos de pago, comprobantes de caja, ticket de venta, or any document that serves as proof of payment or transaction completion — not a formal tax document.
- "purchase_order": Órdenes de compra, solicitudes de adquisición, or any document requesting goods or services before a transaction occurs.

Respond with the category and your confidence score between 0 and 1.`;

const getImageContentPart = (documentUrl: string): ImagePart => ({
  type: "image",
  image: new URL(documentUrl),
});

const getFileContentPart = (
  documentUrl: string,
  mimeType: typeof UPLOADABLE_MIME_TYPES.PDF,
): FilePart => ({
  type: "file",
  data: new URL(documentUrl),
  mediaType: mimeType,
});

export interface CategorizationResult {
  category: DocumentCategory;
  confidence: number;
}

interface CategorizeParams {
  documentUrl: string;
  mimeType: UploadableMimeType;
}

export interface CategorizationProvider {
  categorize: (params: CategorizeParams) => Promise<CategorizationResult>;
}

interface CategorizationProviderConfig {
  aiGatewayUrl: string;
  apiKey: string;
}

export const createCategorizationProvider = (
  config: CategorizationProviderConfig,
): CategorizationProvider => {
  const openRouter = createOpenRouter({
    apiKey: config.apiKey,
    baseURL: config.aiGatewayUrl,
  });

  const categorize: CategorizationProvider["categorize"] = async (params) => {
    const { documentUrl, mimeType } = params;

    const contentPart =
      mimeType === UPLOADABLE_MIME_TYPES.PDF
        ? getFileContentPart(documentUrl, mimeType)
        : getImageContentPart(documentUrl);

    const { output } = await generateText({
      messages: [
        {
          role: "user",
          content: [contentPart],
        },
      ],
      model: openRouter(CATEGORIZATION_MODEL),
      output: Output.object({
        schema: categorizationSchema,
      }),
      system: CATEGORIZATION_SYSTEM_PROMPT,
      temperature: 0,
    });

    // Output.object() throws NoObjectGeneratedError if structured output cannot be parsed
    return output;
  };

  return {
    categorize,
  };
};
