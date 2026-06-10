import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import * as z from "zod";

import {
  SIGNED_URL_EXPIRATION_TIME,
  UPLOADABLE_MIME_TYPES,
  WIZARD_UPLOAD_FILE_COUNT,
} from "#/domains/wizard/constants/wizard.mod";
import type { CategorizationProvider } from "#/domains/wizard/services/categorization.mod.server";
import { createCategorizationProvider } from "#/domains/wizard/services/categorization.mod.server";
import type {
  NewUploadedDocument,
  UploadedDocument,
} from "#/shared/db/db.schema.server";
import {
  analysisSessionsTable,
  uploadedDocumentsTable,
} from "#/shared/db/db.schema.server";
import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const CONFIDENCE_DECIMAL_PLACES = 2;

const STORAGE_KEY_PREFIX = "uploads/";

interface SelectedDocument extends Pick<
  UploadedDocument,
  "fileName" | "fileSizeBytes" | "id" | "mimeType" | "storageKey"
> {}

const appendSignedUrls = async (documents: SelectedDocument[]) => {
  const { storage } = getApplicationBindings();

  return Promise.all(
    documents.map(async (document) => {
      const cdnUrl = await storage.getSignedUrl(
        document.storageKey,
        SIGNED_URL_EXPIRATION_TIME,
      );

      return {
        ...document,
        cdnUrl: cdnUrl.toString(),
      };
    }),
  );
};

const uploadedFileSchema = z.object({
  fileName: z.string().trim().nonempty(),
  fileSizeBytes: z.int().positive(),
  mimeType: z.enum(UPLOADABLE_MIME_TYPES),
  storageKey: z
    .string()
    .trim()
    .refine((val) => {
      if (!val.startsWith(STORAGE_KEY_PREFIX)) return false;

      const uuid = val.replace(STORAGE_KEY_PREFIX, "");

      return z.uuidv4().safeParse(uuid).success;
    }, "Please provide a valid storage key."),
});

interface UploadedFile extends z.output<typeof uploadedFileSchema> {}

const createSessionInputSchema = z.object({
  documents: z.array(uploadedFileSchema).length(WIZARD_UPLOAD_FILE_COUNT),
});

const getDocumentsBySessionInputsSchema = z.object({
  sessionId: z.uuidv4(),
});

const createDocument = async (
  sessionId: string,
  uploadedFile: UploadedFile,
  categorizationProvider: CategorizationProvider,
): Promise<NewUploadedDocument> => {
  const { storage } = getApplicationBindings();

  const signedUrl = await storage.getSignedUrl(
    uploadedFile.storageKey,
    SIGNED_URL_EXPIRATION_TIME,
  );

  const { category, confidence } = await categorizationProvider.categorize({
    documentUrl: signedUrl.toString(),
    mimeType: uploadedFile.mimeType,
  });

  return {
    aiSuggestedCategory: category,
    // DB column is `numeric(3,2)` — explicit rounding to match stored precision
    aiSuggestionConfidence: confidence.toFixed(CONFIDENCE_DECIMAL_PLACES),
    category,

    fileName: uploadedFile.fileName,
    fileSizeBytes: uploadedFile.fileSizeBytes,
    mimeType: uploadedFile.mimeType,
    storageKey: uploadedFile.storageKey,

    sessionId,
  };
};

export const wizardRouter = createTRPCRouter({
  createSessionWithDocuments: publicProcedure
    .input(createSessionInputSchema)
    .mutation(async (opts) => {
      const { documents } = opts.input;
      const { db, env } = getApplicationBindings();

      const sessionId = randomUUID();

      const categorizationProvider = createCategorizationProvider({
        aiGatewayUrl: env.CLOUDFLARE_AI_GATEWAY_URL,
        apiKey: env.OPENROUTER_API_KEY,
      });

      const newDocuments = await Promise.all(
        documents.map(async (uploadedFile) =>
          createDocument(sessionId, uploadedFile, categorizationProvider),
        ),
      );

      const insertedDocuments = await db.transaction(async (tx) => {
        await tx.insert(analysisSessionsTable).values({
          id: sessionId,
          status: "draft",
        });

        return tx
          .insert(uploadedDocumentsTable)
          .values(newDocuments)
          .returning({
            fileName: uploadedDocumentsTable.fileName,
            fileSizeBytes: uploadedDocumentsTable.fileSizeBytes,
            id: uploadedDocumentsTable.id,
            mimeType: uploadedDocumentsTable.mimeType,
            storageKey: uploadedDocumentsTable.storageKey,
          });
      });

      const documentsWithUrls = await appendSignedUrls(insertedDocuments);

      return {
        documents: documentsWithUrls,
        sessionId,
      };
    }),
  getDocumentsBySession: publicProcedure
    .input(getDocumentsBySessionInputsSchema)
    .query(async (opts) => {
      const { sessionId } = opts.input;

      const { db } = getApplicationBindings();

      const selectedDocuments = await db
        .select({
          fileName: uploadedDocumentsTable.fileName,
          fileSizeBytes: uploadedDocumentsTable.fileSizeBytes,
          id: uploadedDocumentsTable.id,
          mimeType: uploadedDocumentsTable.mimeType,
          storageKey: uploadedDocumentsTable.storageKey,
        })
        .from(uploadedDocumentsTable)
        .where(eq(uploadedDocumentsTable.sessionId, sessionId));

      const documents = await appendSignedUrls(selectedDocuments);

      return {
        documents,
      };
    }),
});
