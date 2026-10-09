import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
import * as z from "zod";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

// The regex copies Ky 2.1.0's delayPattern. This check is stricter than Ky.
// It rejects HTTP dates, zero, and unsafe integers.
// eslint-disable-next-line zod/prefer-string-schema-with-trim -- The regex accepts only digits, so .trim() cannot change an accepted value.
const retryAfterSecondsSchema = z
  .string()
  .regex(/^\d+$/v)
  .transform(Number)
  .pipe(z.int().positive());

const shouldRetryServerDirectedWorkflowRequest = ({
  error,
}: ShouldRetryState): false | undefined => {
  if (!(error instanceof HTTPError)) {
    return false;
  }
  if (error.response.status !== SERVICE_UNAVAILABLE_STATUS_CODE) {
    return false;
  }

  if (
    retryAfterSecondsSchema.validate(error.response.headers.get("Retry-After"))
  ) {
    // Ky 2.1.0 applies the server Retry-After delay and the maxRetryAfter cap only when shouldRetry returns undefined.
    // Returning true would replace the server-directed delay with Ky's own computed delay.
    return;
  }
  return false;
};

export const WORKFLOW_SERVER_DIRECTED_RETRY_OPTIONS = {
  limit: 2,
  maxRetryAfter: 4000,
  methods: ["post"],
  shouldRetry: shouldRetryServerDirectedWorkflowRequest,
} satisfies RetryOptions;

export const createWorkflowHttpClient = (baseUrl: URL): KyInstance => {
  return ky.create({
    baseUrl,
    retry: 0,
    timeout: 10_000,
    totalTimeout: 10_000,
  });
};
