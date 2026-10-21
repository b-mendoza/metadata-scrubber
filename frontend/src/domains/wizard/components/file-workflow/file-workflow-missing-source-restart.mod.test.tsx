import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { NOT_FOUND_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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

test.each([
  { step: "inspection", completion: "success", order: "before" },
  { step: "inspection", completion: "missing", order: "before" },
  { step: "inspection", completion: "success", order: "after" },
  { step: "inspection", completion: "missing", order: "after" },
  { step: "scrub", completion: "success", order: "before" },
  { step: "scrub", completion: "missing", order: "before" },
  { step: "scrub", completion: "success", order: "after" },
  { step: "scrub", completion: "missing", order: "after" },
] as const)(
  "missing-source reset rejects old callbacks and $step $completion $order the replacement result",
  async ({ step, completion, order }) => {
    const { backend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const oldInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000503",
    };
    const missingInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000504",
    };
    const newInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000505",
    };
    const oldReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "cccccccccccccccccccccccccccccccc",
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
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "dddddddddddddddddddddddddddddddd",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "new-author",
          originalByteSize: 10,
          action: "remove",
        },
      ],
    };
    const oldResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/old-grant" },
    };
    const newResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/new-result" },
    };
    const newGrant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/new-grant",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const missing: BackendErrorResponse = { error: "private-source-missing" };
    const oldResponse = Promise.withResolvers<Response>();
    const newResponse = Promise.withResolvers<Response>();
    backend.mockResolvedValueOnce(Response.json(config));
    if (step === "scrub") {
      backend.mockResolvedValueOnce(Response.json(oldReview));
    }
    backend.mockReturnValueOnce(oldResponse.promise);
    if (step === "scrub") {
      backend.mockResolvedValueOnce(Response.json(oldReview));
    }
    backend
      .mockResolvedValueOnce(
        Response.json(missing, { status: NOT_FOUND_STATUS_CODE }),
      )
      .mockReturnValueOnce(newResponse.promise)
      .mockResolvedValueOnce(Response.json(newResult))
      .mockResolvedValueOnce(Response.json(newGrant));
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    const oldUploader = uploader.current;
    expect.assert(oldUploader != null);
    act(() => {
      oldUploader.onUploadComplete(oldInput);
    });
    if (step === "scrub") {
      await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    }
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(ONE_PENDING_MUTATION);
    });
    await user.click(screen.getByRole("button", { name: "Start again" }));
    const missingUploader = uploader.current;
    expect.assert(missingUploader != null);
    act(() => {
      missingUploader.onUploadComplete(missingInput);
    });
    if (step === "scrub") {
      await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    }
    await screen.findByRole("status", { name: "PDF no longer available" });
    const newUploader = uploader.current;
    expect.assert(newUploader != null);
    act(() => {
      missingUploader.onUploadComplete(missingInput);
      oldUploader.onUploadComplete(oldInput);
    });
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    act(() => {
      newUploader.onUploadComplete(newInput);
    });
    await screen.findByRole("status", { name: "Inspecting PDF" });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(TWO_PENDING_MUTATIONS);
    });
    const successfulResponse = { inspection: oldReview, scrub: oldResult }[
      step
    ];
    const lateResponse =
      completion === "missing"
        ? Response.json(missing, { status: NOT_FOUND_STATUS_CODE })
        : Response.json(successfulResponse);
    if (order === "before") {
      act(() => {
        oldResponse.resolve(lateResponse);
      });
    }
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(
        order === "before" ? ONE_PENDING_MUTATION : TWO_PENDING_MUTATIONS,
      );
    });
    expect(
      screen.getByRole("status", { name: "Inspecting PDF" }),
    ).toBeVisible();
    expect(screen.queryByText("old-private-author")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "PDF no longer available" }),
    ).not.toBeInTheDocument();
    act(() => {
      newResponse.resolve(Response.json(newReview));
    });
    expect(await screen.findByText("new-author")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Scrub it" }));
    expect(
      await screen.findByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", newGrant.downloadUrl);
    if (order === "after") {
      act(() => {
        oldResponse.resolve(lateResponse);
      });
    }
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(NO_PENDING_MUTATIONS);
    });
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      newGrant.downloadUrl,
    );
    expect(screen.queryByText("old-private-author")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "PDF no longer available" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
    queryClient.clear();
  },
);
