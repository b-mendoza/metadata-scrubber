import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import posthog from "posthog-js";
import { expect, test, vi } from "vitest";

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

const CLEAN_EXPLANATION = /no supported identifying metadata needs removal/iv;
const SIGNED_EXPLANATION = /this version does not support signed PDFs/iv;
const RETENTION_TEXT = /Files expire after one day/iv;

const EXPECTED_INSPECTION_REQUEST_COUNT = 2;
const EXPECTED_SCRUB_REQUEST_COUNT = 3;

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

test("an already-clean PDF offers restart and qualified retention, not scrub", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000096",
  };
  const result: RouterOutputs["wizard"]["dryRun"] = {
    etag: "11111111111111111111111111111111",
    fields: [],
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(result));
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
  });

  expect(
    await screen.findByRole("heading", { name: "Already clean" }),
  ).toHaveFocus();
  expect(screen.getByText(CLEAN_EXPLANATION)).toBeVisible();
  expect(screen.getByText(RETENTION_TEXT)).toHaveTextContent(
    "Deletion usually occurs within 24 hours after expiry, but it can take longer.",
  );
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  await user.click(screen.getByRole("button", { name: "Start again" }));
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toBeVisible();
});

test("signed PDFs explain the limitation and retention without offering scrub", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000097",
  };
  const error: BackendErrorResponse = {
    error: "private-signed-provider-detail",
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(error, { status: 422 }));
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
  });

  expect(
    await screen.findByRole("heading", { name: "Signed PDF not supported" }),
  ).toHaveFocus();
  expect(screen.getByText(SIGNED_EXPLANATION)).toBeVisible();
  expect(screen.getByText(RETENTION_TEXT)).toHaveTextContent(
    "Deletion usually occurs within 24 hours after expiry, but it can take longer.",
  );
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(error.error)).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_INSPECTION_REQUEST_COUNT);
  await user.click(screen.getByRole("button", { name: "Start again" }));
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toBeVisible();
});

test("a scrub conflict removes confirmation and requires a new upload", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000098",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: "22222222222222222222222222222222",
    fields: [
      {
        name: "Author",
        label: "Author",
        preview: "private-conflict-author",
        originalByteSize: 23,
        action: "remove",
      },
    ],
  };
  const error: BackendErrorResponse = {
    error: "private-conflict-provider-detail",
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(error, { status: 409 }));
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));

  expect(
    await screen.findByRole("heading", { name: "PDF changed" }),
  ).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Start again to review the current PDF.",
  );
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Retry scrub" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(EXPECTED_SCRUB_REQUEST_COUNT);
  await user.click(screen.getByRole("button", { name: "Start again" }));
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toBeVisible();
});

test("missing source during inspection leaves a named notification and fresh upload", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000099",
  };
  const error: BackendErrorResponse = {
    error: "private-missing-inspection-detail",
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(error, { status: 404 }));
  renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
  });

  expect(
    await screen.findByRole("status", { name: "PDF no longer available" }),
  ).toHaveTextContent("Upload the PDF again.");
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(screen.getByText("Choose a PDF")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(location.pathname).toBe("/");
  expect(location.search).toBe("");
});

test("missing source during scrub clears the old review and keeps the notification", async () => {
  const { backend, uploadComplete, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000100",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: "33333333333333333333333333333333",
    fields: [
      {
        name: "Author",
        label: "Author",
        preview: "private-missing-author",
        originalByteSize: 22,
        action: "remove",
      },
    ],
  };
  const error: BackendErrorResponse = { error: "private-missing-scrub-detail" };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(error, { status: 404 }));
  const { user } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  act(() => {
    uploadComplete(input);
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));

  expect(
    await screen.findByRole("status", { name: "PDF no longer available" }),
  ).toHaveTextContent("Upload the PDF again.");
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(screen.getByText("Choose a PDF")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(location.pathname).toBe("/");
  expect(location.search).toBe("");
});

test.each(["typed", "unknown"] as const)(
  "%s inspection failure stays private and offers restart",
  async (failure) => {
    const { backend, uploadComplete, view } = setupWorkflow();
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
    const { user } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    if (failure === "unknown") {
      vi.mocked(fetch).mockRejectedValueOnce(new Error(error.error));
    }
    act(() => {
      uploadComplete(input);
    });

    expect(
      await screen.findByRole("heading", { name: "Could not inspect PDF" }),
    ).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not inspect the PDF. Start again to upload a supported PDF.",
    );
    expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("alert"),
    );
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scrub it" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toBeVisible();
  },
);
