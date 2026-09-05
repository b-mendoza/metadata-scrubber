import { once } from "node:events";

import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import type {
  DryRunInput,
  RefreshDownloadGrantInput,
} from "./wizard-contracts.mod.server";
import {
  CREATE_UPLOAD_FAILURE_MESSAGE,
  DRY_RUN_FAILURE_MESSAGE,
  REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE,
  wizardRouter,
} from "./wizard-router.mod.server";

vi.mock(
  import("#/shared/middlewares/application-bindings/application-bindings.mod"),
  () => ({
    getApplicationBindings: vi.fn(),
  }),
);

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const MINIMUM_FILE_SIZE_BYTES = 1;

const createWizardCaller = createCallerFactory(wizardRouter);

const callerForRequest = (request: Request) => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

const requireTRPCError = async (
  operation: Promise<unknown>,
): Promise<TRPCError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    if (error instanceof TRPCError) {
      return error;
    }
  }
  expect.fail("the workflow procedure must reject with a TRPCError");
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("an unclassified transport failure maps to BAD_GATEWAY without public details", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: MINIMUM_FILE_SIZE_BYTES,
  };
  const providerDetails = "provider-credential-sentinel";
  const transportFailure = new Error(providerDetails);
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(transportFailure);
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request).createUpload(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
  expect(error.message).not.toContain(providerDetails);
  expect(error.cause).toBe(transportFailure);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a workflow client timeout maps to TIMEOUT without a retry", async () => {
  vi.useFakeTimers();
  const input: RefreshDownloadGrantInput = {
    etag: CANONICAL_ETAG,
    storageKey: STORAGE_KEY,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockReturnValue(Promise.race<Response>([]));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const errorPromise = requireTRPCError(
    callerForRequest(request).refreshDownloadGrant(input),
  );
  await vi.runAllTimersAsync();
  const error = await errorPromise;

  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(REFRESH_DOWNLOAD_GRANT_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("caller cancellation maps safely and starts no extra fetch", async () => {
  const input: DryRunInput = { storageKey: STORAGE_KEY };
  const fetchMock = vi.fn<typeof fetch>(
    async (fetchInput): Promise<Response> => {
      const backendRequest =
        fetchInput instanceof Request ? fetchInput : new Request(fetchInput);
      await once(backendRequest.signal, "abort");
      throw new DOMException("aborted", "AbortError");
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const request = new Request(FRONTEND_URL, { signal: controller.signal });

  const errorPromise = requireTRPCError(
    callerForRequest(request).dryRun(input),
  );
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  controller.abort();
  const error = await errorPromise;

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});
