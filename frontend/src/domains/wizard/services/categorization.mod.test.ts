import { faker } from "@faker-js/faker";
import { describe, expect, it, vi } from "vitest";

import { UPLOADABLE_MIME_TYPES } from "#/domains/wizard/constants/wizard.mod";

import type { CategorizationResult } from "./categorization.mod.server";
import {
  CATEGORIZATION_MODEL,
  CATEGORIZATION_SYSTEM_PROMPT,
  createCategorizationProvider,
} from "./categorization.mod.server";

const API_KEY_LENGTH = 32;

const { mockCreateOpenRouter, mockGenerateText, mockOpenRouterFactory } =
  vi.hoisted(() => {
    const mockOpenRouterFactory = vi.fn(() => ({
      modelId: CATEGORIZATION_MODEL,
    }));
    const mockCreateOpenRouter = vi.fn(() => mockOpenRouterFactory);
    const mockGenerateText = vi.fn<
      (...args: unknown[]) => {
        output: CategorizationResult;
      }
    >();

    return {
      mockCreateOpenRouter,
      mockGenerateText,
      mockOpenRouterFactory,
    };
  });

vi.mock("ai", () => ({
  Output: {
    object: vi.fn((opts: { schema: unknown }) => opts),
  },
  generateText: mockGenerateText,
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mockCreateOpenRouter,
}));

const TEST_CONFIG = {
  aiGatewayUrl: faker.internet.url(),
  apiKey: faker.string.alphanumeric(API_KEY_LENGTH),
};

const TEST_DOCUMENT_URL = faker.internet.url();

describe("createCategorizationProvider", () => {
  describe("happy path", () => {
    it("returns structured category and confidence from the AI model", async () => {
      const mockResult: CategorizationResult = {
        category: "invoice",
        confidence: 0.85,
      };

      mockGenerateText.mockResolvedValueOnce({
        output: mockResult,
      });

      const provider = createCategorizationProvider(TEST_CONFIG);

      const result = await provider.categorize({
        documentUrl: TEST_DOCUMENT_URL,
        mimeType: UPLOADABLE_MIME_TYPES.JPEG,
      });

      expect(result).toStrictEqual(mockResult);
    });
  });

  describe("MIME routing", () => {
    it.each([
      UPLOADABLE_MIME_TYPES.JPEG,
      UPLOADABLE_MIME_TYPES.PNG,
      UPLOADABLE_MIME_TYPES.WEBP,
    ])("routes %s through the image content part", async (mimeType) => {
      mockGenerateText.mockResolvedValueOnce({
        output: { category: "receipt", confidence: 0.9 },
      });

      const provider = createCategorizationProvider(TEST_CONFIG);

      await provider.categorize({
        documentUrl: TEST_DOCUMENT_URL,
        mimeType,
      });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: [
                expect.objectContaining({
                  type: "image",
                  image: new URL(TEST_DOCUMENT_URL),
                }),
              ],
            },
          ],
        }),
      );
    });

    it("routes PDF through the file content part with mediaType", async () => {
      const mockResult: CategorizationResult = {
        category: "purchase_order",
        confidence: 0.95,
      };

      mockGenerateText.mockResolvedValueOnce({
        output: mockResult,
      });

      const provider = createCategorizationProvider(TEST_CONFIG);

      const categorizeParams = {
        documentUrl: faker.internet.url(),
        mimeType: UPLOADABLE_MIME_TYPES.PDF,
      };

      const result = await provider.categorize(categorizeParams);

      expect(result).toStrictEqual(mockResult);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: [
                expect.objectContaining({
                  type: "file",
                  data: new URL(categorizeParams.documentUrl),
                  mediaType: categorizeParams.mimeType,
                }),
              ],
            },
          ],
        }),
      );
    });
  });

  describe("AI provider configuration", () => {
    it("passes the expected model to the AI provider", async () => {
      mockGenerateText.mockResolvedValueOnce({
        output: { category: "invoice", confidence: 0.75 },
      });

      const provider = createCategorizationProvider(TEST_CONFIG);

      await provider.categorize({
        documentUrl: TEST_DOCUMENT_URL,
        mimeType: UPLOADABLE_MIME_TYPES.JPEG,
      });

      expect(mockOpenRouterFactory).toHaveBeenCalledWith(CATEGORIZATION_MODEL);
    });

    it("configures OpenRouter with gateway URL and API key", () => {
      createCategorizationProvider(TEST_CONFIG);

      expect(mockCreateOpenRouter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: TEST_CONFIG.apiKey,
          baseURL: TEST_CONFIG.aiGatewayUrl,
        }),
      );
    });

    it("includes the categorization system prompt", async () => {
      mockGenerateText.mockResolvedValueOnce({
        output: { category: "invoice", confidence: 0.75 },
      });

      const provider = createCategorizationProvider(TEST_CONFIG);

      await provider.categorize({
        documentUrl: TEST_DOCUMENT_URL,
        mimeType: UPLOADABLE_MIME_TYPES.JPEG,
      });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: CATEGORIZATION_SYSTEM_PROMPT,
        }),
      );
    });
  });

  describe("error handling", () => {
    it("propagates API errors from the AI provider", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("OpenRouter API error"));

      const provider = createCategorizationProvider(TEST_CONFIG);

      await expect(
        provider.categorize({
          documentUrl: TEST_DOCUMENT_URL,
          mimeType: UPLOADABLE_MIME_TYPES.JPEG,
        }),
      ).rejects.toThrow("OpenRouter API error");
    });

    it("propagates structured output parsing errors", async () => {
      mockGenerateText.mockRejectedValueOnce(
        new TypeError("Failed to parse structured output"),
      );

      const provider = createCategorizationProvider(TEST_CONFIG);

      await expect(
        provider.categorize({
          documentUrl: TEST_DOCUMENT_URL,
          mimeType: UPLOADABLE_MIME_TYPES.JPEG,
        }),
      ).rejects.toThrow("Failed to parse structured output");
    });
  });
});
