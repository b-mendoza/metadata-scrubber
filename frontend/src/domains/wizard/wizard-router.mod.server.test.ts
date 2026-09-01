import ky from "ky";
import { expect, test, vi } from "vitest";

import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import type { WorkflowConfig } from "./wizard-router.mod.server";
import {
  wizardRouter,
  WORKFLOW_MAX_FILE_SIZE_BYTES,
} from "./wizard-router.mod.server";

vi.mock(
  import("#/shared/middlewares/application-bindings/application-bindings.mod"),
  () => ({
    getApplicationBindings: vi.fn(),
  }),
);

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const FIRST_FETCH_CALL_INDEX = 0;
const FETCH_INPUT_ARGUMENT_INDEX = 0;

const testEnvironment = environmentSchema.parse({
  BACKEND_URL: BACKEND_BASE_URL.href,
});
const createWizardCaller = createCallerFactory(wizardRouter);

type WizardCaller = ReturnType<typeof createWizardCaller>;

const callerForRequest = (request: Request): WizardCaller => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    env: testEnvironment,
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

const onlyFetchRequest = (
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
): Request => {
  expect(fetchMock).toHaveBeenCalledOnce();
  const firstFetchCall = fetchMock.mock.calls.at(FIRST_FETCH_CALL_INDEX);
  expect(firstFetchCall).toBeDefined();
  const request = firstFetchCall?.at(FETCH_INPUT_ARGUMENT_INDEX);
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request)) {
    expect.fail("Ky must call fetch with a Request");
  }
  return request;
};

test("getWorkflowConfig returns the exact backend-owned byte limit", async () => {
  const response: WorkflowConfig = {
    maxFileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const result = await callerForRequest(request).getWorkflowConfig();

  expect(result).toEqual(response);
  const backendRequest = onlyFetchRequest(fetchMock);
  expect(backendRequest.method).toBe("GET");
  expect(backendRequest.url).toBe("https://backend.test/api/files/config");
});
