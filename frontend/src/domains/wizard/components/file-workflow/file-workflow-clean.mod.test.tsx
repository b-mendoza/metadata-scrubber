import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
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

const INSPECTION_REQUEST_COUNT = 2;
const REPLACEMENT_REQUEST_COUNT = 3;
const NO_PENDING_MUTATIONS = 0;
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

test("empty inspection ends with qualified retention and keyboard restart without scrub or download", async () => {
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000801",
  };
  const clean: RouterOutputs["wizard"]["dryRun"] = {
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fields: [],
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(clean));
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete(input);
  });
  expect(
    await screen.findByRole("heading", { name: "Already clean" }),
  ).toHaveFocus();
  expect(
    screen.getByText("No supported identifying metadata needs removal."),
  ).toBeVisible();
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  expect(screen.getAllByRole("button")).toEqual([
    screen.getByRole("button", { name: "Start again" }),
  ]);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "PDF ready" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Review metadata" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
  expect(screen.queryByText(clean.etag)).not.toBeInTheDocument();
  act(() => {
    oldUploader.onUploadComplete(input);
  });
  expect(backend).toHaveBeenCalledTimes(INSPECTION_REQUEST_COUNT);
  await user.tab();
  expect(screen.getByRole("button", { name: "Start again" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(
    screen.queryByRole("heading", { name: "Already clean" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(INSPECTION_REQUEST_COUNT);
  const newUploader = uploader.current;
  expect.assert(newUploader != null);
  const newInput: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000802",
  };
  const newReview: RouterOutputs["wizard"]["dryRun"] = {
    etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fields: [
      {
        name: "info.author",
        label: "Author",
        preview: "New author",
        originalByteSize: 10,
        action: "remove",
      },
    ],
  };
  backend.mockResolvedValueOnce(Response.json(newReview));
  act(() => {
    oldUploader.onUploadComplete(input);
    newUploader.onUploadComplete(newInput);
  });
  expect(await screen.findByRole("button", { name: "Scrub it" })).toBeEnabled();
  expect(backend).toHaveBeenCalledTimes(REPLACEMENT_REQUEST_COUNT);
  expect(
    backend.mock.calls.map(([request]) => new URL(request.url).pathname),
  ).toEqual(["/api/files/config", "/api/files/dry-run", "/api/files/dry-run"]);
  unmount();
  queryClient.clear();
});

test("a late empty inspection cannot replace the restarted review", async () => {
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const oldInput: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000803",
  };
  const oldClean: RouterOutputs["wizard"]["dryRun"] = {
    etag: "cccccccccccccccccccccccccccccccc",
    fields: [],
  };
  const newInput: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000804",
  };
  const newReview: RouterOutputs["wizard"]["dryRun"] = {
    etag: "dddddddddddddddddddddddddddddddd",
    fields: [
      {
        name: "info.author",
        label: "Author",
        preview: "Replacement author",
        originalByteSize: 18,
        action: "remove",
      },
    ],
  };
  const oldResponse = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockReturnValueOnce(oldResponse.promise)
    .mockResolvedValueOnce(Response.json(newReview));
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("heading", { name: "Upload PDF" });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete(oldInput);
  });
  await screen.findByRole("status", { name: "Inspecting PDF" });
  await user.click(screen.getByRole("button", { name: "Start again" }));
  const newUploader = uploader.current;
  expect.assert(newUploader != null);
  act(() => {
    newUploader.onUploadComplete(newInput);
  });
  expect(await screen.findByText("Replacement author")).toBeVisible();
  act(() => {
    oldResponse.resolve(Response.json(oldClean));
  });
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(NO_PENDING_MUTATIONS);
  });
  expect(
    screen.getByRole("heading", { name: "Review metadata" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Scrub it" })).toBeEnabled();
  expect(
    screen.queryByRole("heading", { name: "Already clean" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(REPLACEMENT_REQUEST_COUNT);
  unmount();
  queryClient.clear();
});
