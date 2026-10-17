import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import posthog from "posthog-js";
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
const DOWNLOAD_LIFETIME = /about 15 minutes/iv;

const EXPECTED_INSPECTION_REQUEST_COUNT = 2;
const EXPECTED_SCRUB_REQUEST_COUNT = 3;
const EXPECTED_RETRY_REQUEST_COUNT = 4;
const EXPECTED_SECOND_FLOW_REQUEST_COUNT = 5;
const SCRUB_REQUEST_INDEX = 2;
const RETRY_REQUEST_INDEX = 3;
const SECOND_SCRUB_REQUEST_INDEX = 4;
const AUTOMATIC_RETRY_WINDOW_MS = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

function setupWorkflow() {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const uploadComplete =
    vi.fn<(input: RouterInputs["wizard"]["dryRun"]) => void>();
  vi.mocked(FileUploader).mockImplementation((props) => {
    uploadComplete.mockImplementation(props.onUploadComplete);
    return <p>Choose a PDF</p>;
  });
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
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <FileWorkflow />
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, uploadComplete, view };
}

test("duplicate upload callbacks keep one inspection and show backend metadata as text", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
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
        label: "Backend author",
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
  renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
    uploadComplete(input);
  });
  expect(
    await screen.findByRole("status", { name: "Inspecting PDF" }),
  ).toBeVisible();
  act(() => {
    response.resolve(Response.json(result));
  });

  const heading = await screen.findByRole("heading", {
    name: "Review metadata",
  });
  expect(heading).toHaveFocus();
  act(() => {
    uploadComplete(input);
  });
  expect(backend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  expect(screen.getByText("unregistered.author")).toBeVisible();
  expect(screen.getByText("Backend author")).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
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
  expect(screen.queryByText(result.etag)).not.toBeInTheDocument();
  const scrub = screen.getByRole("button", { name: "Scrub it" });
  // eslint-disable-next-line testing-library/no-node-access -- The retention contract requires the next element in reading order.
  expect(scrub.nextElementSibling).toHaveTextContent(
    "Files expire after one day. Deletion usually occurs within 24 hours after expiry, but it can take longer.",
  );
});

test("same-turn confirmation sends the reviewed revision once and restart clears the result", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
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
        label: "Author",
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
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockReturnValueOnce(response.promise);
  const consoleError = vi.spyOn(console, "error");
  const capture = vi.spyOn(posthog, "capture");
  const captureException = vi.spyOn(posthog, "captureException");
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete({ storageKey: input.storageKey });
  });
  const scrub = await screen.findByRole("button", { name: "Scrub it" });
  act(() => {
    scrub.click();
    scrub.click();
  });

  expect(
    await screen.findByRole("status", { name: "Scrubbing PDF" }),
  ).toBeVisible();
  expect(scrub).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Start again" }),
  ).not.toBeInTheDocument();
  await waitFor(() => {
    expect(backend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
  });
  const [scrubRequest] = backend.mock.calls[SCRUB_REQUEST_INDEX] ?? [];
  expect.assert(scrubRequest != null);
  expect(await scrubRequest.json()).toEqual(input);
  act(() => {
    response.resolve(Response.json(result));
  });
  const download = await screen.findByRole("link", { name: "Download PDF" });
  expect(download).toHaveAttribute("href", result.result.downloadUrl);
  expect(download).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(download);
  expect(screen.getByText(DOWNLOAD_LIFETIME)).toBeVisible();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
  expect(fetch).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);

  await user.click(screen.getByRole("button", { name: "Start again" }));
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  const nextInput: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000094",
    etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
  const nextReview: RouterOutputs["wizard"]["dryRun"] = {
    etag: nextInput.etag,
    fields: [
      {
        name: "Creator",
        label: "Creator",
        preview: "next-private-creator",
        originalByteSize: 20,
        action: "remove",
      },
    ],
  };
  backend
    .mockResolvedValueOnce(Response.json(nextReview))
    .mockResolvedValueOnce(Response.json(result));
  act(() => {
    uploadComplete({ storageKey: nextInput.storageKey });
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));
  await screen.findByRole("link", { name: "Download PDF" });
  const [nextScrubRequest] =
    backend.mock.calls[SECOND_SCRUB_REQUEST_INDEX] ?? [];
  expect.assert(nextScrubRequest != null);
  expect(await nextScrubRequest.json()).toEqual(nextInput);
  expect(backend).toHaveBeenCalledTimes(EXPECTED_SECOND_FLOW_REQUEST_COUNT);
  expect(consoleError).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
});

test("a failed scrub has safe text and explicit retry reuses the review without inspection", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
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
        label: "Author",
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
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(error, { status: 500 }));
  const consoleError = vi.spyOn(console, "error");
  const capture = vi.spyOn(posthog, "capture");
  const captureException = vi.spyOn(posthog, "captureException");
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete({ storageKey: input.storageKey });
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Could not scrub the PDF. Try again or start again.",
  );
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getByRole("main")).toContainElement(alert);
  expect(screen.queryByText(error.error)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  vi.useFakeTimers();
  await act(async () => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("visibilitychange"));
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(AUTOMATIC_RETRY_WINDOW_MS);
  });
  expect(backend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
  vi.useRealTimers();
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/private-retried-signature" },
  };
  backend.mockResolvedValueOnce(Response.json(result));
  await user.click(screen.getByRole("button", { name: "Retry scrub" }));
  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", result.result.downloadUrl);
  const [firstRequest] = backend.mock.calls[SCRUB_REQUEST_INDEX] ?? [];
  const [retryRequest] = backend.mock.calls[RETRY_REQUEST_INDEX] ?? [];
  expect.assert(firstRequest != null && retryRequest != null);
  expect(await firstRequest.json()).toEqual(input);
  expect(await retryRequest.json()).toEqual(input);
  expect(backend).toHaveBeenCalledTimes(EXPECTED_RETRY_REQUEST_COUNT);
  expect(consoleError).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
});
