import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { UNPROCESSABLE_ENTITY_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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
const INSPECTION_REQUEST_COUNT = 2;
const SCRUB_REQUEST_COUNT = 3;
const ONE_REPLACEMENT_REQUEST = 1;
const LAST_REQUEST_INDEX = -1;
const SIGNED_LIMITATION =
  "This version does not support signed PDFs. Removing metadata can invalidate a digital signature.";
const RETENTION_TEXT =
  "Files expire after one day. Deletion usually follows within 24 hours after expiry, but it can take longer.";

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
  return { backend, frontend, queryClient, uploader, view };
}

test.each(["inspection", "scrub"] as const)(
  "%s 422 focuses the signed-PDF limitation with retention and only keyboard restart",
  async (step) => {
    const { backend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const input: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000601",
    };
    const review: RouterOutputs["wizard"]["dryRun"] = {
      etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "private-signed-author",
          originalByteSize: 21,
          action: "remove",
        },
      ],
    };
    const error: BackendErrorResponse = { error: "private-provider-detail" };
    backend.mockResolvedValueOnce(Response.json(config));
    if (step === "scrub") {
      backend.mockResolvedValueOnce(Response.json(review));
    }
    backend.mockResolvedValueOnce(
      Response.json(error, { status: UNPROCESSABLE_ENTITY_STATUS_CODE }),
    );
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    const oldUploader = uploader.current;
    expect.assert(oldUploader != null);
    act(() => {
      oldUploader.onUploadComplete(input);
    });
    if (step === "scrub") {
      await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    }

    expect(
      await screen.findByRole("heading", { name: "Signed PDF not supported" }),
    ).toHaveFocus();
    expect(screen.getByText(SIGNED_LIMITATION)).toBeVisible();
    expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
    expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
    expect(screen.getAllByRole("button")).toEqual([
      screen.getByRole("button", { name: "Start again" }),
    ]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("private-signed-author")).not.toBeInTheDocument();
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
    expect(screen.queryByText(review.etag)).not.toBeInTheDocument();
    act(() => {
      oldUploader.onUploadComplete(input);
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(NO_PENDING_MUTATIONS);
    });
    const expectedRequests =
      step === "scrub" ? SCRUB_REQUEST_COUNT : INSPECTION_REQUEST_COUNT;
    expect(backend).toHaveBeenCalledTimes(expectedRequests);
    await user.tab();
    expect(screen.getByRole("button", { name: "Start again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    expect(screen.queryByText(SIGNED_LIMITATION)).not.toBeInTheDocument();
    expect(screen.queryByText(RETENTION_TEXT)).not.toBeInTheDocument();
    const newUploader = uploader.current;
    expect.assert(newUploader != null);
    const newInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000602",
    };
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      fields: [],
    };
    backend.mockResolvedValueOnce(Response.json(newReview));
    act(() => {
      oldUploader.onUploadComplete(input);
      newUploader.onUploadComplete(newInput);
    });
    expect(
      await screen.findByRole("button", { name: "Scrub it" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Review metadata" }),
    ).toHaveFocus();
    expect(backend).toHaveBeenCalledTimes(
      expectedRequests + ONE_REPLACEMENT_REQUEST,
    );
    const [request] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(request != null);
    expect(await request.json()).toEqual(newInput);
    unmount();
    queryClient.clear();
  },
);

test.each(["inspection", "scrub"] as const)(
  "%s does not infer a signed PDF from an untyped error message",
  async (step) => {
    const { backend, frontend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const input: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000603",
    };
    const review: RouterOutputs["wizard"]["dryRun"] = {
      etag: "cccccccccccccccccccccccccccccccc",
      fields: [],
    };
    backend.mockResolvedValueOnce(Response.json(config));
    if (step === "scrub") {
      backend.mockResolvedValueOnce(Response.json(review));
    }
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("heading", { name: "Upload PDF" });
    const currentUploader = uploader.current;
    expect.assert(currentUploader != null);
    const message = "signed PDFs are not supported in v1";
    if (step === "inspection") {
      frontend.mockRejectedValueOnce(new Error(message));
    }
    act(() => {
      currentUploader.onUploadComplete(input);
    });
    if (step === "scrub") {
      const scrub = await screen.findByRole("button", { name: "Scrub it" });
      frontend.mockRejectedValueOnce(new Error(message));
      await user.click(scrub);
    }
    expect(await screen.findByRole("alert")).toHaveTextContent(
      step === "inspection"
        ? "Could not inspect the PDF."
        : "Could not scrub the PDF. Try again.",
    );
    expect(
      screen.queryByRole("heading", { name: "Signed PDF not supported" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    unmount();
    queryClient.clear();
  },
);
