import timers from "node:timers/promises";

import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
import * as z from "zod";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

const CLIENT_RETRY_BASE_DELAY_MS = 300;
const CLIENT_RETRY_GROWTH_FACTOR = 2;
const FIRST_RETRY_COUNT = 1;
const NO_CLIENT_DELAY_MS = 0;

// Ky accepts other server timing formats; this workflow accepts only positive whole seconds.
// eslint-disable-next-line zod/prefer-string-schema-with-trim -- The regex accepts only digits, so .trim() cannot change an accepted value.
const retryAfterSecondsSchema = z
  .string()
  .regex(/^\d+$/v)
  .pipe(z.coerce.number())
  .pipe(z.int().positive());

const shouldRetryServerDirectedWorkflowRequest = async ({
  error,
  retryCount,
}: ShouldRetryState): Promise<false | undefined> => {
  if (!(error instanceof HTTPError)) {
    return false;
  }
  if (error.response.status !== SERVICE_UNAVAILABLE_STATUS_CODE) {
    return false;
  }

  if (
    retryAfterSecondsSchema.validate(error.response.headers.get("Retry-After"))
  ) {
    // Ky skips its jitter for server timing, so add client backoff before its capped server wait.
    const clientDelay = Math.floor(
      // eslint-disable-next-line sonarjs/pseudo-random -- Retry timing needs variation, not cryptographic secrecy.
      Math.random() *
        CLIENT_RETRY_BASE_DELAY_MS *
        CLIENT_RETRY_GROWTH_FACTOR ** (retryCount - FIRST_RETRY_COUNT),
    );
    if (clientDelay > NO_CLIENT_DELAY_MS) {
      await timers.setTimeout(clientDelay, null, {
        signal: error.request.signal,
      });
    }
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

export const createWorkflowHttpClient = (
  baseUrl: URL,
  incomingHeaders?: Headers,
): KyInstance => {
  const headers = new Headers();
  const distinctId = incomingHeaders?.get("X-POSTHOG-DISTINCT-ID");
  const sessionId = incomingHeaders?.get("X-POSTHOG-SESSION-ID");
  if (distinctId != null) {
    headers.set("X-POSTHOG-DISTINCT-ID", distinctId);
  }
  if (sessionId != null) {
    headers.set("X-POSTHOG-SESSION-ID", sessionId);
  }

  return ky.create({
    baseUrl,
    headers,
    retry: 0,
    timeout: 10_000,
    totalTimeout: 10_000,
  });
};
