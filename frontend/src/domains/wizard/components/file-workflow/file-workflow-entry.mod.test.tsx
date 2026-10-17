import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import posthog from "posthog-js";
import { afterEach, expect, test, vi } from "vitest";

import {
  FakeXMLHttpRequest,
  getFileInput,
  installXMLHttpRequestFake,
} from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { Route } from "#/routes/index";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { TRPCProvider } from "#/shared/libs/trpc/client/client.mod";
import { initializeTRPCClient } from "#/shared/libs/trpc/client/client-runtime.mod";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BROWSE_FILES_NAME = /browse files/iv;
const UPLOAD_FILE_NAME = /upload 1 file/iv;

afterEach(() => {
  vi.useRealTimers();
  FakeXMLHttpRequest.reset();
});

const EXPECTED_SINGLE_REQUEST_COUNT = 1;
const EXPECTED_CONFIG_RECOVERY_REQUEST_COUNT = 2;
const EXPECTED_REVIEW_REQUEST_COUNT = 3;
const GRANT_REQUEST_INDEX = 1;
const INSPECTION_REQUEST_INDEX = 2;
const AUTOMATIC_REQUEST_WINDOW_MS = 60_000;

function setupHome() {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const queryClient = new QueryClient();
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create(),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient: ky.create({
      prefix: "https://backend.test",
      retry: 0,
      hooks: { beforeRequest: [async ({ request }) => backend(request)] },
    }),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => createTRPCRequestContext(request),
      });
    }),
  );
  const trpcClient = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  const Home = Route.options.component;
  expect.assert(Home != null);
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <Home />
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, view };
}

test("home config failure waits for explicit retry before mounting the uploader", async () => {
  const { backend, view } = setupHome();
  const firstResponse = Promise.withResolvers<Response>();
  backend.mockReturnValueOnce(firstResponse.promise);
  const { unmount } = renderComponent(view);

  expect(
    screen.getByRole("status", { name: "Loading upload settings" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: BROWSE_FILES_NAME }),
  ).not.toBeInTheDocument();
  const error: BackendErrorResponse = {
    error: "private-config-provider-detail",
  };
  act(() => {
    firstResponse.resolve(Response.json(error, { status: 503 }));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load upload settings",
  );
  expect(screen.queryByText(error.error)).not.toBeInTheDocument();
  backend.mockResolvedValue(Response.json(error, { status: 503 }));
  unmount();
  const { user } = renderComponent(view);

  vi.useFakeTimers();
  await act(async () => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("visibilitychange"));
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(AUTOMATIC_REQUEST_WINDOW_MS);
  });
  expect(backend).toHaveBeenCalledOnce();
  vi.useRealTimers();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  backend.mockResolvedValueOnce(Response.json(config));
  await user.tab();
  expect(screen.getByRole("button", { name: "Retry settings" })).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(
    await screen.findByRole("button", { name: BROWSE_FILES_NAME }),
  ).toBeVisible();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_CONFIG_RECOVERY_REQUEST_COUNT);
});

test("home uses runtime size, a direct PUT, and one inspection before review", async () => {
  installXMLHttpRequestFake();
  const { backend, view } = setupHome();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "private-file-name.pdf",
    fileSizeBytes: 3,
  };
  const grant: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000091",
    uploadUrl: "https://uploads.test/private-upload-signature",
  };
  const inspection: RouterOutputs["wizard"]["dryRun"] = {
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fields: [
      {
        action: "remove",
        label: "Private author",
        name: "custom.author",
        originalByteSize: 4,
        preview: "private-metadata",
      },
    ],
  };
  const inspectionResponse = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(inspectionResponse.promise);
  const consoleError = vi.spyOn(console, "error");
  const capture = vi.spyOn(posthog, "capture");
  const captureException = vi.spyOn(posthog, "captureException");
  const { user } = renderComponent(view);
  await screen.findByRole("button", { name: BROWSE_FILES_NAME });
  const fileInput = await getFileInput(user);
  await user.upload(
    fileInput,
    new File(["12345"], "oversized.pdf", { type: "application/pdf" }),
  );
  expect(backend).toHaveBeenCalledOnce();
  expect(FakeXMLHttpRequest.requests).toEqual([]);
  const file = new File(["pdf"], input.fileName, { type: "application/pdf" });
  await user.upload(fileInput, file);
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(
    screen.getByText(input.fileName),
  );
  expect(backend).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: UPLOAD_FILE_NAME }));
  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(
      EXPECTED_SINGLE_REQUEST_COUNT,
    );
  });
  const [request] = FakeXMLHttpRequest.requests;
  expect.assert(request != null);
  expect(request.method).toBe("PUT");
  expect(request.url).toBe(grant.uploadUrl);
  expect(request.body).toBe(file);
  expect(request.getRequestHeader("Content-Type")).toBe("application/pdf");
  const [grantRequest] = backend.mock.calls[GRANT_REQUEST_INDEX] ?? [];
  expect.assert(grantRequest != null);
  expect(await grantRequest.json()).toEqual(input);
  await act(async () => {
    await request.respond({
      status: 200,
      headers: { ETag: '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' },
    });
  });
  expect(
    await screen.findByRole("status", { name: "Inspecting PDF" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  const [inspectionRequest] =
    backend.mock.calls[INSPECTION_REQUEST_INDEX] ?? [];
  expect.assert(inspectionRequest != null);
  const dryRunInput: RouterInputs["wizard"]["dryRun"] = {
    storageKey: grant.storageKey,
  };
  expect(await inspectionRequest.json()).toEqual(dryRunInput);
  act(() => {
    inspectionResponse.resolve(Response.json(inspection));
  });
  expect(
    await screen.findByRole("heading", { name: "Review metadata" }),
  ).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(
    screen.getByText("private-metadata"),
  );
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("visibilitychange"));
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("online"));
  });
  expect(backend).toHaveBeenCalledTimes(EXPECTED_REVIEW_REQUEST_COUNT);
  expect(consoleError).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
});
