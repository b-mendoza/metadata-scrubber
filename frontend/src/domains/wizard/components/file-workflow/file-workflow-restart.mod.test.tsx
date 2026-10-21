import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
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

const NO_PENDING_MUTATIONS = 0;
const ONE_PENDING_MUTATION = 1;
const TWO_PENDING_MUTATIONS = 2;
const THREE_REQUESTS = 3;
const FOUR_REQUESTS = 4;
const SIX_REQUESTS = 6;
const LAST_REQUEST_INDEX = -1;

function setupWorkflow() {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const uploader: { current: Parameters<typeof FileUploader>[0] | null } = {
    current: null,
  };
  vi.mocked(FileUploader).mockImplementation((props) => {
    uploader.current = props;
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
        <StrictMode>
          <FileWorkflow />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, queryClient, uploader, view };
}

test("keyboard restart clears a completed result and its reviewed data without another request", async () => {
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000201",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fields: [
      {
        name: "Author",
        label: "Author",
        preview: "old-private-author",
        originalByteSize: 18,
        action: "remove",
      },
    ],
  };
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/old-private-grant" },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: result.result.downloadUrl,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(result))
    .mockResolvedValueOnce(Response.json(grant));
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete(input);
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));
  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", result.result.downloadUrl);
  await user.tab();
  await user.tab();
  expect(screen.getByRole("button", { name: "Delete files" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Start again" })).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(uploader.current).not.toBe(oldUploader);
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Review metadata" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("old-private-author")).not.toBeInTheDocument();
  expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
  expect(screen.queryByText(review.etag)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(FOUR_REQUESTS);
  expect(fetch).toHaveBeenCalledTimes(FOUR_REQUESTS);
  unmount();
  queryClient.clear();
});

test.each(["success", "failure"] as const)(
  "late inspection %s and old upload callbacks cannot replace the new flow",
  async (completion) => {
    const { backend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const oldInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000202",
    };
    const newInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000203",
    };
    const oldReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "old-inspection",
          originalByteSize: 14,
          action: "remove",
        },
      ],
    };
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "cccccccccccccccccccccccccccccccc",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "new-inspection",
          originalByteSize: 14,
          action: "replace",
        },
      ],
    };
    const error: BackendErrorResponse = {
      error: "old-private-inspection-error",
    };
    const oldResponse = Promise.withResolvers<Response>();
    const newResponse = Promise.withResolvers<Response>();
    backend
      .mockResolvedValueOnce(Response.json(config))
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    const oldUploader = uploader.current;
    expect.assert(oldUploader != null);
    act(() => {
      oldUploader.onUploadComplete(oldInput);
    });
    await screen.findByRole("status", { name: "Inspecting PDF" });
    const restart = screen.getByRole("button", { name: "Start again" });
    act(() => {
      restart.click();
      oldUploader.onUploadComplete(oldInput);
    });
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    const newUploader = uploader.current;
    expect.assert(newUploader != null);
    act(() => {
      newUploader.onUploadComplete(newInput);
    });
    await screen.findByRole("status", { name: "Inspecting PDF" });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(TWO_PENDING_MUTATIONS);
    });
    act(() => {
      oldResponse.resolve(
        completion === "success"
          ? Response.json(oldReview)
          : Response.json(error, { status: 500 }),
      );
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(ONE_PENDING_MUTATION);
    });

    expect(
      screen.getByRole("status", { name: "Inspecting PDF" }),
    ).toBeVisible();
    expect(screen.queryByText("old-inspection")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => {
      newResponse.resolve(Response.json(newReview));
    });
    expect(await screen.findByText("new-inspection")).toBeVisible();
    expect(screen.queryByText("old-inspection")).not.toBeInTheDocument();
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scrub it" })).toBeEnabled();
    expect(backend).toHaveBeenCalledTimes(THREE_REQUESTS);
    const [request] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(request != null);
    expect(await request.json()).toEqual(newInput);
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    unmount();
    queryClient.clear();
  },
);

test.each(["success", "failure"] as const)(
  "late scrub %s cannot replace a new pending scrub or its result",
  async (completion) => {
    const { backend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const oldInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000204",
    };
    const newInput: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000205",
      etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    };
    const oldReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "dddddddddddddddddddddddddddddddd",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "old-scrub-author",
          originalByteSize: 16,
          action: "remove",
        },
      ],
    };
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: newInput.etag,
      fields: [
        {
          name: "Creator",
          label: "Creator",
          preview: "new-scrub-creator",
          originalByteSize: 17,
          action: "remove",
        },
      ],
    };
    const oldResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/old-late-grant" },
    };
    const newResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/new-result-grant" },
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: newResult.result.downloadUrl,
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const error: BackendErrorResponse = { error: "old-private-scrub-error" };
    const oldResponse = Promise.withResolvers<Response>();
    const newResponse = Promise.withResolvers<Response>();
    backend
      .mockResolvedValueOnce(Response.json(config))
      .mockResolvedValueOnce(Response.json(oldReview))
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce(Response.json(newReview))
      .mockReturnValueOnce(newResponse.promise)
      .mockResolvedValueOnce(Response.json(grant));
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    const oldUploader = uploader.current;
    expect.assert(oldUploader != null);
    act(() => {
      oldUploader.onUploadComplete(oldInput);
    });
    await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    await screen.findByRole("status", { name: "Scrubbing PDF" });
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    const newUploader = uploader.current;
    expect.assert(newUploader != null);
    act(() => {
      newUploader.onUploadComplete({ storageKey: newInput.storageKey });
    });
    await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    await screen.findByRole("status", { name: "Scrubbing PDF" });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(TWO_PENDING_MUTATIONS);
    });
    act(() => {
      oldResponse.resolve(
        completion === "success"
          ? Response.json(oldResult)
          : Response.json(error, { status: 500 }),
      );
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(ONE_PENDING_MUTATION);
    });

    expect(screen.getByRole("status", { name: "Scrubbing PDF" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Scrub it" })).toBeDisabled();
    expect(screen.getByText("new-scrub-creator")).toBeVisible();
    expect(screen.queryByText("old-scrub-author")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    act(() => {
      newResponse.resolve(Response.json(newResult));
    });
    expect(
      await screen.findByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", newResult.result.downloadUrl);
    expect(backend).toHaveBeenCalledTimes(SIX_REQUESTS);
    const [request] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(request != null);
    expect(await request.json()).toEqual(newInput);
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    unmount();
    queryClient.clear();
  },
);

test("restart while expiry is unknown rejects a late verified grant", async () => {
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000306",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: "ffffffffffffffffffffffffffffffff",
    fields: [],
  };
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/unverified-old-grant" },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/late-old-grant",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(result))
    .mockReturnValueOnce(response.promise);
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete(input);
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));
  await screen.findByRole("status", { name: "Checking download link" });
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Start again" }));
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  act(() => {
    response.resolve(Response.json(grant));
  });
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(NO_PENDING_MUTATIONS);
  });
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "PDF ready" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(FOUR_REQUESTS);
  unmount();
  queryClient.clear();
});
