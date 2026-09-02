import ky, {
  HTTPError,
  type KyInstance,
  type RetryOptions,
  type ShouldRetryState,
} from "ky";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

export type WorkflowHTTPClient = KyInstance;

export const WORKFLOW_CONFIG_TIMEOUT_MS = 10_000;
export const WORKFLOW_ONE_SHOT_TIMEOUT_MS = 10_000;
export const WORKFLOW_DRY_RUN_TIMEOUT_MS = 90_000;
export const WORKFLOW_SCRUB_TIMEOUT_MS = 240_000;
export const WORKFLOW_RETRY_LIMIT = 2;
export const WORKFLOW_RETRY_MAX_RETRY_AFTER_MS = 4000;
export const WORKFLOW_RETRY_ON_TIMEOUT = false;

const NO_RETRY_LIMIT = 0;
const MINIMUM_RETRY_AFTER_SECONDS = 1;
const POSITIVE_WHOLE_SECONDS_PATTERN = /^\d+$/;

export const shouldRetryServerDirectedWorkflowRequest = ({
  error,
}: ShouldRetryState): false | undefined => {
  if (!(error instanceof HTTPError)) {
    return false;
  }
  if (error.response.status !== SERVICE_UNAVAILABLE_STATUS_CODE) {
    return false;
  }

  const retryAfter = error.response.headers.get("Retry-After");
  if (retryAfter == null || !POSITIVE_WHOLE_SECONDS_PATTERN.test(retryAfter)) {
    return false;
  }

  const retryAfterSeconds = Number(retryAfter);
  if (
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= MINIMUM_RETRY_AFTER_SECONDS
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
