import type { KyInstance } from "ky";
import ky from "ky";

export type HTTPClient = KyInstance;

export const HTTP_CLIENT_ATTEMPT_TIMEOUT_MS = 3000;
export const HTTP_CLIENT_TOTAL_TIMEOUT_MS = 5000;
export const HTTP_CLIENT_RETRY_LIMIT = 1;
export const HTTP_CLIENT_RETRY_MAX_RETRY_AFTER_MS = 250;
export const HTTP_CLIENT_RETRY_BACKOFF_LIMIT_MS = 250;
export const HTTP_CLIENT_RETRY_ON_TIMEOUT = false;

export const createHttpClient = (baseUrl: URL): HTTPClient => {
  return ky.create({
    baseUrl,
    retry: {
      backoffLimit: HTTP_CLIENT_RETRY_BACKOFF_LIMIT_MS,
      limit: HTTP_CLIENT_RETRY_LIMIT,
      maxRetryAfter: HTTP_CLIENT_RETRY_MAX_RETRY_AFTER_MS,
      retryOnTimeout: HTTP_CLIENT_RETRY_ON_TIMEOUT,
    },
    timeout: HTTP_CLIENT_ATTEMPT_TIMEOUT_MS,
    totalTimeout: HTTP_CLIENT_TOTAL_TIMEOUT_MS,
  });
};
