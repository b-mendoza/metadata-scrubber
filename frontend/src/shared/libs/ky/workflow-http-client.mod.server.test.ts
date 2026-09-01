import { HTTPError } from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { SERVICE_UNAVAILABLE_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  createWorkflowHttpClient,
  WORKFLOW_NO_RETRY_OPTIONS,
  WORKFLOW_ONE_SHOT_TIMEOUT_MS,
} from "./workflow-http-client.mod.server";

const BACKEND_BASE_URL = new URL("https://backend.test/");
const WORKFLOW_PATH = "/api/files/dry-run";

const unavailableResponse = (): Response => {
  return Response.json(
    { error: "processing capacity temporarily unavailable" },
    {
      headers: { "Retry-After": "1" },
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    },
  );
};

const captureFailure = async (
  operation: PromiseLike<Response>,
): Promise<unknown> => {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  expect.fail("the workflow request must reject");
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a one-shot request does not retry any upstream failure", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(unavailableResponse());
  vi.stubGlobal("fetch", fetchMock);
  const client = createWorkflowHttpClient(BACKEND_BASE_URL);

  const failurePromise = captureFailure(
    client.post(WORKFLOW_PATH, {
      retry: WORKFLOW_NO_RETRY_OPTIONS,
      timeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
      totalTimeout: WORKFLOW_ONE_SHOT_TIMEOUT_MS,
    }),
  );
  await vi.runAllTimersAsync();

  const error = await failurePromise;
  expect(error).toBeInstanceOf(HTTPError);
  expect(fetchMock).toHaveBeenCalledOnce();
});
