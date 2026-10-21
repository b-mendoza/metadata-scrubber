import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
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

const EXPECTED_INSPECTION_REQUEST_COUNT = 2;
const EXPECTED_SCRUB_REQUEST_COUNT = 3;
const EXPECTED_VERIFIED_RESULT_REQUEST_COUNT = 4;
const EXPECTED_RETRY_REQUEST_COUNT = 5;
const SCRUB_REQUEST_INDEX = 2;
const LAST_REQUEST_INDEX = -1;
const EXPIRY_EXPLANATION =
  /Download link expiry and file deletion are separate/v;
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

test("same-turn consent scrubs the stored reviewed pair once and shows the direct result grant", async () => {
  const { backend, frontend, queryClient, uploadComplete, view } =
    setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000093",
    etag: "dddddddddddddddddddddddddddddddd",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: input.etag,
    fields: [
      {
        name: "Author",
        label: "Backend author",
        preview: "private-author",
        originalByteSize: 14,
        action: "remove",
      },
    ],
  };
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: {
      downloadUrl: "https://downloads.test/private-download-signature",
    },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/verified-result-signature",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce(Response.json(grant));
  const consoleError = vi.spyOn(console, "error");
  const capture = vi.spyOn(posthog, "capture");
  const captureException = vi.spyOn(posthog, "captureException");
  const { unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete({ storageKey: input.storageKey });
  });
  const confirm = await screen.findByRole("button", { name: "Scrub it" });
  expect(backend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  act(() => {
    uploadComplete({
      storageKey: "uploads/00000000-0000-4000-8000-000000000094",
    });
    confirm.click();
    confirm.click();
  });

  const pending = await screen.findByRole("status", { name: "Scrubbing PDF" });
  expect(pending).toBeVisible();
  expect(confirm).toBeDisabled();
  expect(
    screen.getByRole("heading", { name: "Review metadata" }),
  ).toHaveFocus();
  expect(screen.getByText("private-author")).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(pending);
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  await waitFor(() => {
    expect(backend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
  });
  const [request] = backend.mock.calls[SCRUB_REQUEST_INDEX] ?? [];
  expect.assert(request != null);
  expect(request.url).toBe("https://backend.test/api/files/scrub");
  expect(request.method).toBe("POST");
  expect(await request.json()).toEqual(input);
  act(() => {
    response.resolve(Response.json(result));
  });

  const download = await screen.findByRole("link", { name: "Download PDF" });
  expect(screen.getByRole("heading", { name: "PDF ready" })).toHaveFocus();
  expect(
    screen.getByText(
      "Producer, CreationDate, and ModDate can have neutral replacements. A neutral replacement does not remove the field.",
    ),
  ).toBeVisible();
  expect(download).toHaveAttribute("href", grant.downloadUrl);
  const [grantRequest] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
  expect.assert(grantRequest != null);
  expect(await grantRequest.json()).toEqual(input);
  expect(download).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(download).not.toHaveAttribute("download");
  expect(screen.getByRole("main")).toContainElement(download);
  expect(screen.getByText(EXPIRY_EXPLANATION)).toBeVisible();
  expect(screen.getByRole("button", { name: "Start again" })).toBeEnabled();
  expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
  expect(screen.queryByText(input.etag)).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_VERIFIED_RESULT_REQUEST_COUNT);
  expect(
    frontend.mock.calls.map(
      ([url]) => new URL(url instanceof Request ? url.url : url).pathname,
    ),
  ).toEqual([
    "/api/trpc/wizard.getWorkflowConfig",
    "/api/trpc/wizard.dryRun",
    "/api/trpc/wizard.scrubFile",
    "/api/trpc/wizard.refreshDownloadGrant",
  ]);
  expect(consoleError).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
  unmount();
  queryClient.clear();
});

test.each(["typed", "unknown"] as const)(
  "%s scrub failure permits deliberate retry of the reviewed pair without another inspection",
  async (failure) => {
    const { backend, frontend, queryClient, uploadComplete, view } =
      setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const input: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000095",
      etag: "ffffffffffffffffffffffffffffffff",
    };
    const review: RouterOutputs["wizard"]["dryRun"] = {
      etag: input.etag,
      fields: [
        {
          name: "Author",
          label: "Backend author",
          preview: "private-scrub-author",
          originalByteSize: 20,
          action: "remove",
        },
      ],
    };
    const error: BackendErrorResponse = {
      error: "private-scrub-provider-detail",
    };
    backend
      .mockResolvedValueOnce(Response.json(config))
      .mockResolvedValueOnce(Response.json(review));
    if (failure === "typed") {
      backend.mockResolvedValueOnce(Response.json(error, { status: 500 }));
    }
    const consoleError = vi.spyOn(console, "error");
    const capture = vi.spyOn(posthog, "capture");
    const captureException = vi.spyOn(posthog, "captureException");
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    act(() => {
      uploadComplete({ storageKey: input.storageKey });
    });
    const confirm = await screen.findByRole("button", { name: "Scrub it" });
    if (failure === "unknown") {
      frontend.mockRejectedValueOnce(new Error(error.error));
    }
    await user.click(confirm);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not scrub the PDF. Try again.");
    expect(
      screen.getByRole("heading", { name: "Review metadata" }),
    ).toHaveFocus();
    expect(screen.getByText("private-scrub-author")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry scrub" })).toBeEnabled();
    expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
    expect(screen.getByRole("main")).toContainElement(alert);
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    vi.useFakeTimers();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(AUTOMATIC_RETRY_WINDOW_MS);
    });
    expect(frontend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
    vi.useRealTimers();
    const result: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: {
        downloadUrl: "https://downloads.test/private-retried-signature",
      },
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/verified-retried-signature",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    backend
      .mockResolvedValueOnce(Response.json(result))
      .mockResolvedValueOnce(Response.json(grant));
    await user.tab();
    expect(screen.getByRole("button", { name: "Retry scrub" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", grant.downloadUrl);
    const [retryRequest] =
      backend.mock.calls
        .filter(
          ([request]) => new URL(request.url).pathname === "/api/files/scrub",
        )
        .at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(retryRequest != null);
    expect(retryRequest.url).toBe("https://backend.test/api/files/scrub");
    expect(await retryRequest.json()).toEqual(input);
    expect(frontend).toHaveBeenCalledTimes(EXPECTED_RETRY_REQUEST_COUNT);
    expect(consoleError).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  },
);
