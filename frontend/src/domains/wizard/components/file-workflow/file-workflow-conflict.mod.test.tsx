import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { CONFLICT_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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

const CONFLICT_REQUEST_COUNT = 3;
const COMPLETED_REQUEST_COUNT = 6;
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

test("a scrub conflict removes stale consent and requires a new upload and review", async () => {
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const oldInput: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000701",
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const oldReview: RouterOutputs["wizard"]["dryRun"] = {
    etag: oldInput.etag,
    fields: [
      {
        name: "Author",
        label: "Author",
        preview: "private-old-author",
        originalByteSize: 18,
        action: "remove",
      },
    ],
  };
  const error: BackendErrorResponse = { error: "private-revision-detail" };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(oldReview))
    .mockResolvedValueOnce(
      Response.json(error, { status: CONFLICT_STATUS_CODE }),
    );
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete({ storageKey: oldInput.storageKey });
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));

  expect(
    await screen.findByRole("heading", { name: "PDF changed" }),
  ).toHaveFocus();
  const notice = screen.getByRole("alert");
  expect(notice).toHaveTextContent(
    "The PDF changed since review. Start again to upload and review the current PDF.",
  );
  expect(screen.getByRole("main")).toContainElement(notice);
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getAllByRole("button")).toEqual([
    screen.getByRole("button", { name: "Start again" }),
  ]);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText("private-old-author")).not.toBeInTheDocument();
  expect(screen.queryByText(oldInput.storageKey)).not.toBeInTheDocument();
  expect(screen.queryByText(oldInput.etag)).not.toBeInTheDocument();
  expect(screen.queryByText(error.error)).not.toBeInTheDocument();
  act(() => {
    oldUploader.onUploadComplete({ storageKey: oldInput.storageKey });
  });
  expect(backend).toHaveBeenCalledTimes(CONFLICT_REQUEST_COUNT);
  const [oldRequest] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
  expect.assert(oldRequest != null);
  expect(await oldRequest.json()).toEqual(oldInput);
  await user.tab();
  expect(screen.getByRole("button", { name: "Start again" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(CONFLICT_REQUEST_COUNT);
  const newUploader = uploader.current;
  expect.assert(newUploader != null);
  const newInput: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000702",
    etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const newReview: RouterOutputs["wizard"]["dryRun"] = {
    etag: newInput.etag,
    fields: [
      {
        name: "Creator",
        label: "Creator",
        preview: "new-creator",
        originalByteSize: 11,
        action: "remove",
      },
    ],
  };
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/new-result" },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/new-verified-grant",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  backend
    .mockResolvedValueOnce(Response.json(newReview))
    .mockResolvedValueOnce(Response.json(result))
    .mockResolvedValueOnce(Response.json(grant));
  act(() => {
    oldUploader.onUploadComplete({ storageKey: oldInput.storageKey });
    newUploader.onUploadComplete({ storageKey: newInput.storageKey });
  });
  expect(await screen.findByText("new-creator")).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Scrub it" }));
  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", grant.downloadUrl);
  const scrubRequests = backend.mock.calls.filter(
    ([request]) => new URL(request.url).pathname === "/api/files/scrub",
  );
  const [newRequest] = scrubRequests.at(LAST_REQUEST_INDEX) ?? [];
  expect.assert(newRequest != null);
  expect(await newRequest.json()).toEqual(newInput);
  expect(backend).toHaveBeenCalledTimes(COMPLETED_REQUEST_COUNT);
  expect(
    backend.mock.calls.map(([request]) => new URL(request.url).pathname),
  ).toEqual([
    "/api/files/config",
    "/api/files/dry-run",
    "/api/files/scrub",
    "/api/files/dry-run",
    "/api/files/scrub",
    "/api/files/download-grant",
  ]);
  unmount();
  queryClient.clear();
});
