import ky, {
  type KyInstance,
  type RetryOptions,
} from "ky";

export type WorkflowHTTPClient = KyInstance;

export const WORKFLOW_CONFIG_TIMEOUT_MS = 10_000;
export const WORKFLOW_ONE_SHOT_TIMEOUT_MS = 10_000;
export const WORKFLOW_DRY_RUN_TIMEOUT_MS = 90_000;
export const WORKFLOW_SCRUB_TIMEOUT_MS = 240_000;
export const WORKFLOW_RETRY_LIMIT = 2;
export const WORKFLOW_RETRY_MAX_RETRY_AFTER_MS = 4000;
export const WORKFLOW_RETRY_ON_TIMEOUT = false;

const NO_RETRY_LIMIT = 0;

export const WORKFLOW_NO_RETRY_OPTIONS = {
  limit: NO_RETRY_LIMIT,
  retryOnTimeout: WORKFLOW_RETRY_ON_TIMEOUT,
} satisfies RetryOptions;

export const createWorkflowHttpClient = (baseUrl: URL): WorkflowHTTPClient => {
  return ky.create({
    baseUrl,
    retry: WORKFLOW_NO_RETRY_OPTIONS,
  });
};
