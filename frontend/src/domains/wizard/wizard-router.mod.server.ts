import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { HTTPError, TimeoutError } from "ky";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import {
  BAD_REQUEST_STATUS_CODE,
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  PAYLOAD_TOO_LARGE_STATUS_CODE,
  REQUEST_TIMEOUT_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  UNPROCESSABLE_ENTITY_STATUS_CODE,
  UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";
import {
  WORKFLOW_CONFIG_TIMEOUT_MS,
  WORKFLOW_DRY_RUN_TIMEOUT_MS,
  WORKFLOW_NO_RETRY_OPTIONS,
  WORKFLOW_ONE_SHOT_TIMEOUT_MS,
  WORKFLOW_SCRUB_TIMEOUT_MS,
  WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
} from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

export const WORKFLOW_MAX_FILE_SIZE_BYTES = 10_485_760;

export const WORKFLOW_CONFIG_FAILURE_MESSAGE =
  "Could not load the file workflow configuration. Try again later.";
export const CREATE_UPLOAD_FAILURE_MESSAGE =
  "Could not create the upload. Try again later.";
export const DRY_RUN_FAILURE_MESSAGE =
  "Could not inspect the file. Try again later.";
export const SCRUB_FILE_FAILURE_MESSAGE =
  "Could not scrub the file. Try again later.";
export const REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE =
  "Could not refresh the download. Try again later.";
export const CONFIRM_DELETE_FAILURE_MESSAGE =
  "Could not delete the file. Try again later.";

const WORKFLOW_CONFIG_ENDPOINT = "/api/files/config";
const CREATE_UPLOAD_ENDPOINT = "/api/uploads";
const DRY_RUN_ENDPOINT = "/api/files/dry-run";
const SCRUB_FILE_ENDPOINT = "/api/files/scrub";
const REFRESH_DOWNLOAD_GRANT_ENDPOINT = "/api/files/download-grant";
const CONFIRM_DELETE_ENDPOINT = "/api/files/delete";

const MINIMUM_FILE_SIZE_BYTES = 1;
const MINIMUM_TEXT_LENGTH = 1;
const WHOLE_SECOND_PRECISION = 0;
const MAXIMUM_FILE_NAME_BYTES = 255;
const HTTP_PROTOCOL = /^https?$/;
const INVALID_FILE_NAME_CHARACTERS = new Set(["\\", "/", "\u{FFFD}"]);
const LAST_CONTROL_CHARACTER = "\u{001F}";
const DELETE_CONTROL_CHARACTER = "\u{007F}";
const STORAGE_KEY_PATTERN =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_ETAG_PATTERN = /^[0-9a-f]{32}$/;

const backendStatusCodes = new Map<number, TRPC_ERROR_CODE_KEY>([
  [BAD_REQUEST_STATUS_CODE, "BAD_REQUEST"],
  [NOT_FOUND_STATUS_CODE, "NOT_FOUND"],
  [REQUEST_TIMEOUT_STATUS_CODE, "TIMEOUT"],
  [CONFLICT_STATUS_CODE, "CONFLICT"],
  [PAYLOAD_TOO_LARGE_STATUS_CODE, "PAYLOAD_TOO_LARGE"],
  [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE, "UNSUPPORTED_MEDIA_TYPE"],
  [UNPROCESSABLE_ENTITY_STATUS_CODE, "UNPROCESSABLE_CONTENT"],
  [SERVICE_UNAVAILABLE_STATUS_CODE, "SERVICE_UNAVAILABLE"],
]);

const fileNameContainsInvalidCharacter = (value: string): boolean => {
  for (const character of value) {
    if (
      INVALID_FILE_NAME_CHARACTERS.has(character) ||
      character <= LAST_CONTROL_CHARACTER ||
      character === DELETE_CONTROL_CHARACTER
    ) {
      return true;
    }
  }
  return false;
};

const fileNameSchema = z
  .string({ error: "The file name must be a string." })
  .trim()
  .min(MINIMUM_TEXT_LENGTH, { error: "The file name must not be empty." })
  .refine(
    (value) =>
      new TextEncoder().encode(value).byteLength <= MAXIMUM_FILE_NAME_BYTES,
    { error: "The file name is too long." },
  )
  .refine((value) => !fileNameContainsInvalidCharacter(value), {
    error: "The file name contains a character that is not allowed.",
  });

export const storageKeySchema = z
  .string({ error: "The storage key must be a string." })
  .regex(STORAGE_KEY_PATTERN, { error: "The storage key is invalid." })
  .trim();
export const canonicalETagSchema = z
  .string({ error: "The ETag must be a string." })
  .regex(CANONICAL_ETAG_PATTERN, { error: "The ETag is invalid." })
  .trim();

export const workflowConfigResponseSchema = z.strictObject({
  maxFileSizeBytes: z.literal(WORKFLOW_MAX_FILE_SIZE_BYTES),
});

export const createUploadInputSchema = z.strictObject({
  fileName: fileNameSchema,
  fileSizeBytes: z
    .int()
    .min(MINIMUM_FILE_SIZE_BYTES)
    .max(WORKFLOW_MAX_FILE_SIZE_BYTES),
});

export const createUploadResponseSchema = z.strictObject({
  storageKey: storageKeySchema,
  uploadUrl: z.url({ protocol: HTTP_PROTOCOL }),
});

export const dryRunInputSchema = z.strictObject({
  storageKey: storageKeySchema,
});

const publicFieldSchema = z.strictObject({
  action: z.enum(["remove", "replace"]),
  label: z.string().trim(),
  name: z.string().trim(),
  originalByteSize: z.int().nonnegative(),
  preview: z.string().trim(),
});

export const dryRunResponseSchema = z.strictObject({
  etag: canonicalETagSchema,
  fields: z.array(publicFieldSchema),
});

export const scrubFileInputSchema = z.strictObject({
  etag: canonicalETagSchema,
  storageKey: storageKeySchema,
});

export const scrubFileResponseSchema = z.strictObject({
  result: z.strictObject({
    downloadUrl: z.url({ protocol: HTTP_PROTOCOL }),
  }),
  status: z.literal("done"),
});

export const refreshDownloadGrantInputSchema = z.strictObject({
  etag: canonicalETagSchema,
  storageKey: storageKeySchema,
});

export const refreshDownloadGrantResponseSchema = z.strictObject({
  downloadUrl: z.url({ protocol: HTTP_PROTOCOL }),
  expiresAt: z.iso.datetime({ precision: WHOLE_SECOND_PRECISION }),
});

export const confirmDeleteInputSchema = z.strictObject({
  storageKey: storageKeySchema,
});

export const confirmDeleteResponseSchema = z.strictObject({
  status: z.literal("deleted"),
});

const backendErrorResponseSchema = z.strictObject({
  error: z.string().trim().min(MINIMUM_TEXT_LENGTH),
});

type WorkflowFailureMessage =
  | typeof WORKFLOW_CONFIG_FAILURE_MESSAGE
  | typeof CREATE_UPLOAD_FAILURE_MESSAGE
  | typeof DRY_RUN_FAILURE_MESSAGE
  | typeof SCRUB_FILE_FAILURE_MESSAGE
  | typeof REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE
  | typeof CONFIRM_DELETE_FAILURE_MESSAGE;

const mapWorkflowRequestFailure = async (
  cause: unknown,
  message: WorkflowFailureMessage,
): Promise<TRPCError> => {
  if (cause instanceof TimeoutError) {
    return new TRPCError({ cause, code: "TIMEOUT", message });
  }
  if (!(cause instanceof HTTPError)) {
    return new TRPCError({ cause, code: "BAD_GATEWAY", message });
  }

  const errorBodyResult = await ResultAsync.fromPromise(
    cause.response
      .clone()
      .json()
      .then((body: unknown) => backendErrorResponseSchema.parse(body)),
    () => null,
  );
  if (errorBodyResult.isErr()) {
    return new TRPCError({ cause, code: "BAD_GATEWAY", message });
  }

  const code = backendStatusCodes.get(cause.response.status) ?? "BAD_GATEWAY";
  return new TRPCError({ cause, code, message });
};

export type WorkflowConfig = z.output<typeof workflowConfigResponseSchema>;
export type CreateUploadInput = z.input<typeof createUploadInputSchema>;
export type CreateUploadResponse = z.output<typeof createUploadResponseSchema>;
export type DryRunInput = z.input<typeof dryRunInputSchema>;
export type DryRunResponse = z.output<typeof dryRunResponseSchema>;
export type ScrubFileInput = z.input<typeof scrubFileInputSchema>;
export type ScrubFileResponse = z.output<typeof scrubFileResponseSchema>;
export type RefreshDownloadGrantInput = z.input<
  typeof refreshDownloadGrantInputSchema
>;
export type RefreshDownloadGrantResponse = z.output<
  typeof refreshDownloadGrantResponseSchema
>;
export type ConfirmDeleteInput = z.input<typeof confirmDeleteInputSchema>;
export type ConfirmDeleteResponse = z.output<
  typeof confirmDeleteResponseSchema
>;

export const wizardRouter = createTRPCRouter({
  getWorkflowConfig: publicProcedure.query(async ({ signal }) => {
    const { workflowHttpClient } = getApplicationBindings();
    const responseResult = await ResultAsync.fromPromise(
      workflowHttpClient
        .get(WORKFLOW_CONFIG_ENDPOINT, {
          retry: WORKFLOW_NO_RETRY_OPTIONS,
          signal: signal ?? null,
          timeout: WORKFLOW_CONFIG_TIMEOUT_MS,
          totalTimeout: WORKFLOW_CONFIG_TIMEOUT_MS,
        })
        .json(workflowConfigResponseSchema),
      (cause: unknown) => cause,
    );
    if (responseResult.isErr()) {
      throw await mapWorkflowRequestFailure(
        responseResult.error,
        WORKFLOW_CONFIG_FAILURE_MESSAGE,
      );
    }
    return responseResult.value;
  }),

  createUpload: publicProcedure
    .input(createUploadInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post(CREATE_UPLOAD_ENDPOINT, {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(createUploadResponseSchema),
        (cause: unknown) => cause,
      );
      if (responseResult.isErr()) {
        throw await mapWorkflowRequestFailure(
          responseResult.error,
          CREATE_UPLOAD_FAILURE_MESSAGE,
        );
      }
      return responseResult.value;
    }),

  dryRun: publicProcedure
    .input(dryRunInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post(DRY_RUN_ENDPOINT, {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
            totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
          })
          .json(dryRunResponseSchema),
        (cause: unknown) => cause,
      );
      if (responseResult.isErr()) {
        throw await mapWorkflowRequestFailure(
          responseResult.error,
          DRY_RUN_FAILURE_MESSAGE,
        );
      }
      return responseResult.value;
    }),

  scrubFile: publicProcedure
    .input(scrubFileInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post(SCRUB_FILE_ENDPOINT, {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_SCRUB_TIMEOUT_MS,
            totalTimeout: WORKFLOW_SCRUB_TIMEOUT_MS,
          })
          .json(scrubFileResponseSchema),
        (cause: unknown) => cause,
      );
      if (responseResult.isErr()) {
        throw await mapWorkflowRequestFailure(
          responseResult.error,
          SCRUB_FILE_FAILURE_MESSAGE,
        );
      }
      return responseResult.value;
    }),

  refreshDownloadGrant: publicProcedure
    .input(refreshDownloadGrantInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post(REFRESH_DOWNLOAD_GRANT_ENDPOINT, {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(refreshDownloadGrantResponseSchema),
        (cause: unknown) => cause,
      );
      if (responseResult.isErr()) {
        throw await mapWorkflowRequestFailure(
          responseResult.error,
          REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
        );
      }
      return responseResult.value;
    }),

  confirmDelete: publicProcedure
    .input(confirmDeleteInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post(CONFIRM_DELETE_ENDPOINT, {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(confirmDeleteResponseSchema),
        (cause: unknown) => cause,
      );
      if (responseResult.isErr()) {
        throw await mapWorkflowRequestFailure(
          responseResult.error,
          CONFIRM_DELETE_FAILURE_MESSAGE,
        );
      }
      return responseResult.value;
    }),
});
