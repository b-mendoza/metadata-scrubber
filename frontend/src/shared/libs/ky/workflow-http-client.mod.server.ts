import ky, {
  HTTPError,
  type KyInstance,
  type RetryOptions,
  type ShouldRetryState,
} from "ky";
import * as z from "zod";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

export type WorkflowHTTPClient = KyInstance;

export const WORKFLOW_CONFIG_TIMEOUT_MS = 10_000;
export const WORKFLOW_ONE_SHOT_TIMEOUT_MS = 10_000;
export const WORKFLOW_DRY_RUN_TIMEOUT_MS = 90_000;
export const WORKFLOW_SCRUB_TIMEOUT_MS = 240_000;
export const WORKFLOW_RETRY_LIMIT = 2;
export const WORKFLOW_RETRY_MAX_RETRY_AFTER_MS = 4000;
const WORKFLOW_RETRY_ON_TIMEOUT = false;

const NO_RETRY_LIMIT = 0;
const MINIMUM_RETRY_AFTER_SECONDS = 1;
const DELAY_SECONDS_PATTERN = /^\d+$/;

// The regex copies Ky 2.1.0's delayPattern. The schema is stricter because it rejects HTTP dates, zero, and unsafe integers.
// eslint-disable-next-line zod/prefer-string-schema-with-trim -- Ky 2.1.0 tests the raw header byte for byte. Trim would accept values that Ky rejects.
const retryAfterSecondsSchema = z
  .string({ error: "The Retry-After value must be a string." })
  .regex(DELAY_SECONDS_PATTERN, {
    error: "The Retry-After value must contain only decimal digits.",
  })
  .transform(Number)
  .pipe(
    z
      .int({ error: "The Retry-After value must be a safe integer." })
      .min(MINIMUM_RETRY_AFTER_SECONDS, {
        error: "The Retry-After value must be at least one second.",
      }),
  );

const shouldRetryServerDirectedWorkflowRequest = ({
  error,
}: ShouldRetryState): false | undefined => {
  if (!(error instanceof HTTPError)) {
    return false;
  }
  if (error.response.status !== SERVICE_UNAVAILABLE_STATUS_CODE) {
    return false;
  }

  const retryAfter = error.response.headers.get("Retry-After");
  if (
    retryAfter != null &&
    retryAfterSecondsSchema.safeParse(retryAfter).success
  ) {
    // Ky 2.1.0 applies the server Retry-After delay and the maxRetryAfter cap only when shouldRetry returns undefined.
    // Returning true would replace the server-directed delay with Ky's own computed delay.
    return;
  }
  return false;
};

export const WORKFLOW_NO_RETRY_OPTIONS = {
  limit: NO_RETRY_LIMIT,
  retryOnTimeout: WORKFLOW_RETRY_ON_TIMEOUT,
} satisfies RetryOptions;

export const WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS = {
  afterStatusCodes: [SERVICE_UNAVAILABLE_STATUS_CODE],
  limit: WORKFLOW_RETRY_LIMIT,
  maxRetryAfter: WORKFLOW_RETRY_MAX_RETRY_AFTER_MS,
  methods: ["post"],
  retryOnTimeout: WORKFLOW_RETRY_ON_TIMEOUT,
  shouldRetry: shouldRetryServerDirectedWorkflowRequest,
  statusCodes: [SERVICE_UNAVAILABLE_STATUS_CODE],
} satisfies RetryOptions;

export const createWorkflowHttpClient = (baseUrl: URL): WorkflowHTTPClient => {
  return ky.create({
    baseUrl,
    retry: WORKFLOW_NO_RETRY_OPTIONS,
  });
};
