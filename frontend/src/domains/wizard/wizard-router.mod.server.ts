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
import { WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS } from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

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

const backendStatusCodes: Record<number, TRPC_ERROR_CODE_KEY> = {
  [BAD_REQUEST_STATUS_CODE]: "BAD_REQUEST",
  [NOT_FOUND_STATUS_CODE]: "NOT_FOUND",
  [REQUEST_TIMEOUT_STATUS_CODE]: "TIMEOUT",
  [CONFLICT_STATUS_CODE]: "CONFLICT",
  [PAYLOAD_TOO_LARGE_STATUS_CODE]: "PAYLOAD_TOO_LARGE",
  [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE]: "UNSUPPORTED_MEDIA_TYPE",
  [UNPROCESSABLE_ENTITY_STATUS_CODE]: "UNPROCESSABLE_CONTENT",
  [SERVICE_UNAVAILABLE_STATUS_CODE]: "SERVICE_UNAVAILABLE",
};

const mapWorkflowRequestFailure =
  (message: string) =>
  (cause: unknown): TRPCError => {
    let code: TRPC_ERROR_CODE_KEY = "BAD_GATEWAY";
    if (
      cause instanceof HTTPError &&
      contracts.backendErrorResponseSchema.safeParse(cause.data).success
    ) {
      code = backendStatusCodes[cause.response.status] ?? "BAD_GATEWAY";
    } else if (cause instanceof TimeoutError) {
      code = "TIMEOUT";
    }
    return new TRPCError({ cause, code, message });
  };

export const wizardRouter = createTRPCRouter({
  getWorkflowConfig: publicProcedure.query(async ({ signal }) => {
    const { workflowHttpClient } = getAppBindings();
    const responseResult = await ResultAsync.fromPromise(
      workflowHttpClient
        .get("/api/files/config", {
          signal: signal ?? null,
        })
        .json(contracts.workflowConfigResponseSchema),
      mapWorkflowRequestFailure(WORKFLOW_CONFIG_FAILURE_MESSAGE),
    );
    if (responseResult.isErr()) {
      throw responseResult.error;
    }
    return responseResult.value;
  }),

  createUpload: publicProcedure
    .input(contracts.uploadInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getAppBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/uploads", {
            json: input,
            signal: signal ?? null,
          })
          .json(contracts.uploadResponseSchema),
        mapWorkflowRequestFailure(CREATE_UPLOAD_FAILURE_MESSAGE),
      );
      if (responseResult.isErr()) {
        throw responseResult.error;
      }
      return responseResult.value;
    }),

  dryRun: publicProcedure
    .input(contracts.dryRunInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getAppBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/dry-run", {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: 90_000,
            totalTimeout: 90_000,
          })
          .json(contracts.dryRunResponseSchema),
        mapWorkflowRequestFailure(DRY_RUN_FAILURE_MESSAGE),
      );
      if (responseResult.isErr()) {
        throw responseResult.error;
      }
      return responseResult.value;
    }),

  scrubFile: publicProcedure
    .input(contracts.scrubFileInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getAppBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/scrub", {
            json: input,
            retry: WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS,
            signal: signal ?? null,
            timeout: 240_000,
            totalTimeout: 240_000,
          })
          .json(contracts.scrubFileResponseSchema),
        mapWorkflowRequestFailure(SCRUB_FILE_FAILURE_MESSAGE),
      );
      if (responseResult.isErr()) {
        throw responseResult.error;
      }
      return responseResult.value;
    }),

  refreshDownloadGrant: publicProcedure
    .input(contracts.refreshDownloadGrantInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getAppBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/download-grant", {
            json: input,
            signal: signal ?? null,
          })
          .json(contracts.refreshDownloadGrantResponseSchema),
        mapWorkflowRequestFailure(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE),
      );
      if (responseResult.isErr()) {
        throw responseResult.error;
      }
      return responseResult.value;
    }),

  confirmDelete: publicProcedure
    .input(contracts.confirmDeleteInputSchema)
    .mutation(async ({ input, signal }) => {
      const { workflowHttpClient } = getAppBindings();
      const responseResult = await ResultAsync.fromPromise(
        workflowHttpClient
          .post("/api/files/delete", {
            json: input,
            signal: signal ?? null,
          })
          .json(contracts.confirmDeleteResponseSchema),
        mapWorkflowRequestFailure(CONFIRM_DELETE_FAILURE_MESSAGE),
      );
      if (responseResult.isErr()) {
        throw responseResult.error;
      }
      return responseResult.value;
    }),
});
