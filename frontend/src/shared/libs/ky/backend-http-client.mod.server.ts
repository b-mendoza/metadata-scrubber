import ky from "ky";

export const BACKEND_HTTP_ATTEMPT_TIMEOUT_MS = 3000;
export const BACKEND_HTTP_RETRY_DELAY_LIMIT_MS = 250;
export const BACKEND_HTTP_RETRY_LIMIT = 1;
export const BACKEND_HTTP_TOTAL_TIMEOUT_MS = 5000;

export const backendHttpClient = ky.create({
  retry: {
    backoffLimit: BACKEND_HTTP_RETRY_DELAY_LIMIT_MS,
    jitter: true,
    limit: BACKEND_HTTP_RETRY_LIMIT,
    maxRetryAfter: BACKEND_HTTP_RETRY_DELAY_LIMIT_MS,
    retryOnTimeout: false,
  },
  throwHttpErrors: true,
  timeout: BACKEND_HTTP_ATTEMPT_TIMEOUT_MS,
  totalTimeout: BACKEND_HTTP_TOTAL_TIMEOUT_MS,
});
