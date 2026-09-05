import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { HTTPError, TimeoutError } from "ky";
import { ResultAsync } from "neverthrow";

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

import * as contracts from "./wizard-contracts.mod.server";

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
      .then((body: unknown) =>
        contracts.backendErrorResponseSchema.parse(body),
      ),
    () => null,
  );
  if (errorBodyResult.isErr()) {
    return new TRPCError({ cause, code: "BAD_GATEWAY", message });
  }

  const code = backendStatusCodes.get(cause.response.status) ?? "BAD_GATEWAY";
  return new TRPCError({ cause, code, message });
};

export const wizardRouter = createTRPCRouter({
  getWorkflowConfig: publicProcedure.query(async ({ signal }) => {
    const { workflowHttpClient } = getApplicationBindings();
    const responseResult = await ResultAsync.fromPromise(
      workflowHttpClient
        .get("/api/files/config", {
          retry: WORKFLOW_NO_RETRY_OPTIONS,
          signal: signal ?? null,
          timeout: WORKFLOW_CONFIG_TIMEOUT_MS,
          totalTimeout: WORKFLOW_CONFIG_TIMEOUT_MS,
        })
        .json(contracts.workflowConfigResponseSchema),
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
    .input(contracts.createUploadInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/uploads", {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(contracts.createUploadResponseSchema),
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
    .input(contracts.dryRunInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/dry-run", {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
            totalTimeout: WORKFLOW_DRY_RUN_TIMEOUT_MS,
          })
          .json(contracts.dryRunResponseSchema),
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
    .input(contracts.scrubFileInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/scrub", {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_SCRUB_TIMEOUT_MS,
            totalTimeout: WORKFLOW_SCRUB_TIMEOUT_MS,
          })
          .json(contracts.scrubFileResponseSchema),
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
    .input(contracts.refreshDownloadGrantInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/download-grant", {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(contracts.refreshDownloadGrantResponseSchema),
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
    .input(contracts.confirmDeleteInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getApplicationBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/delete", {
            json: input,
            retry: WORKFLOW_NO_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
            totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
          })
          .json(contracts.confirmDeleteResponseSchema),
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
