import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import Uppy from "@uppy/core";
import ky from "ky";
import { StrictMode } from "react";
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
const EXPECTED_SINGLE_REQUEST_COUNT = 1;
const EXPECTED_TWO_REQUEST_COUNT = 2;
const EXPECTED_THREE_REQUEST_COUNT = 3;
const GRANT_REQUEST_INDEX = 1;
const INSPECTION_REQUEST_INDEX = 2;
const AUTOMATIC_REQUEST_WINDOW_MS = 60_000;

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused();
  onlineManager.setOnline(true);
  FakeXMLHttpRequest.reset();
});

function setupHome() {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const queryClient = new QueryClient();
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create({
      baseUrl: "https://backend.test/",
      hooks: {
        beforeRequest: [
          () => {
            throw new Error("The home route must not request products data");
          },
        ],
      },
    }),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient: ky.create({
      baseUrl: "https://backend.test/",
      retry: 0,
      hooks: { beforeRequest: [async ({ request }) => backend(request)] },
    }),
  });
  const frontend = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => createTRPCRequestContext(request),
      });
    });
  vi.stubGlobal("fetch", frontend);
  const trpcClient = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  const Home = Route.options.component;
  expect.assert(Home != null);
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <StrictMode>
          <Home />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, frontend, queryClient, view };
}

test("home settings failure waits for keyboard retry without grants or automatic requests", async () => {
  const { backend, frontend, queryClient, view } = setupHome();
  const firstResponse = Promise.withResolvers<Response>();
  backend.mockReturnValueOnce(firstResponse.promise);
  const { unmount } = renderComponent(view);

  expect(
    await screen.findByRole("status", { name: "Loading upload settings" }),
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
  expect(
    screen.queryByRole("button", { name: BROWSE_FILES_NAME }),
  ).not.toBeInTheDocument();
  backend.mockResolvedValue(Response.json(error, { status: 503 }));
  unmount();
  const { user, unmount: unmountRetry } = renderComponent(view);

  vi.useFakeTimers();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(AUTOMATIC_REQUEST_WINDOW_MS);
  });
  expect(backend).toHaveBeenCalledOnce();
  expect(frontend).toHaveBeenCalledOnce();
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
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_TWO_REQUEST_COUNT);
  expect(frontend).toHaveBeenCalledTimes(EXPECTED_TWO_REQUEST_COUNT);
  expect(backend.mock.calls.map(([request]) => request.url)).toEqual([
    "https://backend.test/api/files/config",
    "https://backend.test/api/files/config",
  ]);
  unmountRetry();
  queryClient.clear();
});

test("home uploads with runtime size and a direct PUT, then inspects once inside capture exclusion", async () => {
  installXMLHttpRequestFake();
  expect(Route.options.loader).toBeUndefined();
  const { backend, frontend, queryClient, view } = setupHome();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "private-file-name.pdf",
    fileSizeBytes: 4,
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
        label: "Backend author",
        name: "custom.author",
        originalByteSize: 16,
        preview: "private-metadata",
      },
    ],
  };
  const inspectionResponse = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(inspectionResponse.promise);
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("button", { name: BROWSE_FILES_NAME });
  const fileInput = await getFileInput(user);
  await user.upload(
    fileInput,
    new File(["12345"], "oversized.pdf", { type: "application/pdf" }),
  );
  expect(await screen.findAllByRole("alert")).not.toEqual([]);
  expect(backend).toHaveBeenCalledOnce();
  expect(FakeXMLHttpRequest.requests).toEqual([]);
  const file = new File(["%PDF"], input.fileName, { type: "application/pdf" });
  await user.upload(fileInput, file);
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(
    screen.getByText(input.fileName),
  );
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("button", { name: UPLOAD_FILE_NAME }),
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
  expect(grantRequest.method).toBe("POST");
  expect(await grantRequest.json()).toEqual(input);
  const destroy = vi.spyOn(Uppy.prototype, "destroy");
  expect(
    screen.queryByRole("status", { name: "Inspecting PDF" }),
  ).not.toBeInTheDocument();
  await act(async () => {
    await request.respond({
      status: 200,
      headers: { ETag: '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' },
    });
  });

  expect(
    await screen.findByRole("status", { name: "Inspecting PDF" }),
  ).toBeVisible();
  expect(destroy).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Inspect PDF" })).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: BROWSE_FILES_NAME }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Review metadata" }),
  ).not.toBeInTheDocument();
  const [inspectionRequest] =
    backend.mock.calls[INSPECTION_REQUEST_INDEX] ?? [];
  expect.assert(inspectionRequest != null);
  const inspectionInput: RouterInputs["wizard"]["dryRun"] = {
    storageKey: grant.storageKey,
  };
  expect(await inspectionRequest.json()).toEqual(inspectionInput);
  act(() => {
    inspectionResponse.resolve(Response.json(inspection));
  });
  expect(
    await screen.findByRole("heading", { name: "Review metadata" }),
  ).toHaveFocus();
  expect(screen.getByRole("main")).toContainElement(
    screen.getByText("private-metadata"),
  );
  expect(screen.getByRole("button", { name: "Scrub it" })).toBeEnabled();

  vi.useFakeTimers();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(AUTOMATIC_REQUEST_WINDOW_MS);
  });
  expect(backend).toHaveBeenCalledTimes(EXPECTED_THREE_REQUEST_COUNT);
  expect(
    frontend.mock.calls.map(
      ([url]) => new URL(url instanceof Request ? url.url : url).pathname,
    ),
  ).toEqual([
    "/api/trpc/wizard.getWorkflowConfig",
    "/api/trpc/wizard.createUpload",
    "/api/trpc/wizard.dryRun",
  ]);
  vi.useRealTimers();
  unmount();
  expect(destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole("main")).not.toBeInTheDocument();

  const { unmount: unmountCached } = renderComponent(view);
  expect(screen.getByRole("button", { name: BROWSE_FILES_NAME })).toBeVisible();
  expect(screen.queryByText(input.fileName)).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_THREE_REQUEST_COUNT);
  unmountCached();
  queryClient.clear();
});
