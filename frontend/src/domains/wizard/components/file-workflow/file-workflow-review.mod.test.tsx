import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import posthog from "posthog-js";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
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

import { FileWorkflow } from "./file-workflow.mod";

vi.mock(
  import("#/domains/wizard/components/file-uploader/file-uploader.mod"),
  () => ({ FileUploader: vi.fn() }),
);
vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const PREVIEW_EXPLANATION = /previews can be shortened/iv;
const REPLACEMENT_EXPLANATION =
  /neutral replacement does not remove the field/iv;
const SCOPE_EXPLANATION = /does not cover all hidden PDF content/iv;
const RETENTION_TEXT = /Files expire after one day/v;
const EXPECTED_INSPECTION_REQUEST_COUNT = 2;
const INSPECTION_REQUEST_INDEX = 1;
const AUTOMATIC_RETRY_WINDOW_MS = 60_000;

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused();
  onlineManager.setOnline(true);
});

function setupWorkflow() {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const uploadComplete =
    vi.fn<(input: RouterInputs["wizard"]["dryRun"]) => void>();
  vi.mocked(FileUploader).mockImplementation((props) => {
    uploadComplete.mockImplementation(props.onUploadComplete);
    return <div />;
  });
  const queryClient = new QueryClient();
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create(),
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
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <StrictMode>
          <FileWorkflow />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, frontend, queryClient, uploadComplete, view };
}

test("duplicate upload callbacks inspect once and show the backend inventory as text before consent", async () => {
  const { backend, frontend, queryClient, uploadComplete, view } =
    setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000092",
  };
  const result: RouterOutputs["wizard"]["dryRun"] = {
    etag: "cccccccccccccccccccccccccccccccc",
    fields: [
      {
        name: "unregistered.author",
        label: '<script>alert("label")</script>',
        preview: '<img src="private-metadata" onerror="alert(1)">',
        originalByteSize: 91,
        action: "remove",
      },
      {
        name: "unregistered.producer",
        label: "Backend producer",
        preview: "privé",
        originalByteSize: 6,
        action: "replace",
      },
    ],
  };
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockReturnValueOnce(response.promise);
  const consoleError = vi.spyOn(console, "error");
  const capture = vi.spyOn(posthog, "capture");
  const captureException = vi.spyOn(posthog, "captureException");
  const { unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
    uploadComplete(input);
  });

  const pending = await screen.findByRole("status", { name: "Inspecting PDF" });
  expect(pending).toBeVisible();
  expect(screen.getByRole("heading", { name: "Inspect PDF" })).toHaveFocus();
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(pending);
  expect(
    screen.queryByRole("heading", { name: "Review metadata" }),
  ).not.toBeInTheDocument();
  act(() => {
    response.resolve(Response.json(result));
  });

  expect(
    await screen.findByRole("heading", { name: "Review metadata" }),
  ).toHaveFocus();
  act(() => {
    uploadComplete(input);
  });
  const [request] = backend.mock.calls[INSPECTION_REQUEST_INDEX] ?? [];
  expect.assert(request != null);
  expect(request.url).toBe("https://backend.test/api/files/dry-run");
  expect(request.method).toBe("POST");
  expect(await request.json()).toEqual(input);
  expect(screen.getAllByRole("listitem")).toHaveLength(result.fields.length);
  expect(screen.getByText("unregistered.author")).toBeVisible();
  expect(screen.getByText('<script>alert("label")</script>')).toBeVisible();
  expect(screen.getByRole("main")).toContainElement(
    screen.getByText('<img src="private-metadata" onerror="alert(1)">'),
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("91 bytes")).toBeVisible();
  expect(screen.getByText("unregistered.producer")).toBeVisible();
  expect(screen.getByText("Backend producer")).toBeVisible();
  expect(screen.getByRole("main")).toContainElement(screen.getByText("privé"));
  expect(screen.getByText("6 bytes")).toBeVisible();
  expect(screen.getByText("Remove")).toBeVisible();
  expect(screen.getByText("Replace with a neutral value")).toBeVisible();
  expect(screen.getByText(PREVIEW_EXPLANATION)).toBeVisible();
  expect(screen.getByText(REPLACEMENT_EXPLANATION)).toBeVisible();
  expect(screen.getByText(SCOPE_EXPLANATION)).toBeVisible();
  expect(screen.getByText(RETENTION_TEXT)).toHaveTextContent(
    "Files expire after one day. Deletion usually follows within 24 hours after expiry, but it can take longer.",
  );
  expect(screen.queryByText(result.etag)).not.toBeInTheDocument();
  expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "Scrub it" });
  expect(confirm).toBeEnabled();
  expect(screen.getByRole("main")).toContainElement(confirm);
  expect(consoleError).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
  expect(frontend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  expect(backend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  unmount();
  queryClient.clear();
});

test.each(["typed", "unknown"] as const)(
  "%s inspection failure announces safe text without automatic retry or capture",
  async (failure) => {
    const { backend, frontend, queryClient, uploadComplete, view } =
      setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const input: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000101",
    };
    const error: BackendErrorResponse = {
      error: "private-inspection-provider-detail",
    };
    backend.mockResolvedValueOnce(Response.json(config));
    if (failure === "typed") {
      backend.mockResolvedValueOnce(Response.json(error, { status: 415 }));
    }
    const consoleError = vi.spyOn(console, "error");
    const capture = vi.spyOn(posthog, "capture");
    const captureException = vi.spyOn(posthog, "captureException");
    const { unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    if (failure === "unknown") {
      frontend.mockRejectedValueOnce(new Error(error.error));
    }
    act(() => {
      uploadComplete(input);
    });

    expect(
      await screen.findByRole("heading", { name: "Could not inspect PDF" }),
    ).toHaveFocus();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not inspect the PDF.");
    expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
    expect(screen.getByRole("main")).toContainElement(alert);
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Review metadata" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeEnabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    vi.useFakeTimers();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      uploadComplete(input);
      await vi.advanceTimersByTimeAsync(AUTOMATIC_RETRY_WINDOW_MS);
    });
    expect(frontend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
    expect(consoleError).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  },
);
