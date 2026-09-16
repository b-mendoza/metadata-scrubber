import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import { FakeXMLHttpRequest } from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
import { createTestTRPCClient } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { Route as RootRoute } from "#/routes/__root";
import { routeTree } from "#/routeTree.gen";
import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

Object.assign(RootRoute.options, {
  shellComponent: ({ children }: React.PropsWithChildren) => <>{children}</>,
});

vi.mock(
  import("#/domains/wizard/components/file-uploader/file-uploader.mod"),
  async (importOriginal) => {
    const original = await importOriginal();
    return { FileUploader: vi.fn(original.FileUploader) };
  },
);

const GRANT_LIFETIME_MS = 120_000;
const ONE_DELETE = 1;
const EMPTY_STORAGE_COUNT = 0;
const UPLOAD_LIMIT_TEXT = /10 MiB/v;

const UPLOAD_ATTEMPT_COUNT = 2;

const { request, client } = createTestTRPCClient();

beforeEach(() => {
  request.mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.reset();
});

test("the root loads config and the real uploader without a products loader", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, trpc },
  });
  onTestFinished(() => {
    queryClient.clear();
    history.destroy();
  });
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  request.mockResolvedValue(config);
  renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(UPLOAD_LIMIT_TEXT)).toBeVisible();
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: "wizard.getWorkflowConfig",
      type: "query",
    }),
  );
  expect(screen.queryByText("Products")).not.toBeInTheDocument();
});

test("config failure waits for a deliberate retry and keeps upload disabled", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, trpc },
  });
  onTestFinished(() => {
    queryClient.clear();
    history.destroy();
  });
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  request
    .mockRejectedValueOnce(new Error("private config detail"))
    .mockResolvedValueOnce(config);
  const { user } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Loading upload settings",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load upload settings.",
  );
  expect(
    screen.queryByRole("button", { name: "Complete upload" }),
  ).not.toBeInTheDocument();
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("online"));
  });
  expect(request).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Retry settings" }));
  await waitFor(() => {
    expect(request).toHaveBeenCalledTimes(UPLOAD_ATTEMPT_COUNT);
  });
});

test("keyboard flow deletes, restores upload focus, and a fresh mount does not resume identifiers", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const history = createMemoryHistory({
    initialEntries: ["/outcome?kind=clean", "/"],
  });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, trpc },
  });
  onTestFinished(() => {
    queryClient.clear();
    history.destroy();
  });
  vi.mocked(FileUploader).mockImplementation(({ onUploadComplete }) => (
    <button
      type="button"
      onClick={() => {
        onUploadComplete({
          storageKey: "uploads/00000000-0000-4000-8000-000000000001",
        });
      }}
    >
      Complete upload
    </button>
  ));
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  const inspected: RouterOutputs["wizard"]["dryRun"] = {
    etag: "0123456789abcdef0123456789abcdef",
    fields: [
      {
        name: "title",
        label: "Title",
        preview: "private",
        originalByteSize: 7,
        action: "remove",
      },
    ],
  };
  const done: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/initial.pdf" },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/grant.pdf",
    expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
  };
  const pendingRefresh =
    Promise.withResolvers<RouterOutputs["wizard"]["refreshDownloadGrant"]>();
  const pendingDelete =
    Promise.withResolvers<RouterOutputs["wizard"]["confirmDelete"]>();
  const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
    status: "deleted",
  };
  request
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(inspected)
    .mockResolvedValueOnce(done)
    .mockResolvedValueOnce(grant)
    .mockReturnValueOnce(pendingRefresh.promise)
    .mockReturnValueOnce(pendingDelete.promise)
    .mockResolvedValue(config);
  const { user, unmount } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Complete upload" });
  await user.tab();
  await user.keyboard("{Enter}");
  await screen.findByRole("button", { name: "Scrub it" });
  await user.tab();
  await user.keyboard("{Enter}");
  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", grant.downloadUrl);
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.parse(grant.expiresAt));
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitFor(() => {
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "wizard.refreshDownloadGrant" }),
    );
  });
  clock.mockRestore();
  await user.tab();
  expect(screen.getByRole("button", { name: "Delete files" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.tab();
  const confirmButton = screen.getByRole("button", {
    name: "Confirm deletion",
  });
  await user.keyboard("{Enter}");
  fireEvent.click(confirmButton);
  await waitFor(() => {
    expect(
      request.mock.calls.filter(
        ([operation]) => operation.path === "wizard.confirmDelete",
      ),
    ).toHaveLength(ONE_DELETE);
  });
  act(() => {
    pendingDelete.resolve(deleted);
  });
  expect(
    await screen.findByRole("heading", { name: "Upload a PDF" }),
  ).toHaveFocus();
  act(() => {
    pendingRefresh.resolve(grant);
  });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(localStorage).toHaveLength(EMPTY_STORAGE_COUNT);
  expect(sessionStorage).toHaveLength(EMPTY_STORAGE_COUNT);
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
  act(() => {
    history.back();
  });
  await screen.findByRole("heading", {
    name: "This PDF is already clean. No supported metadata needs removal.",
  });
  expect(router.state.location.pathname).toBe("/outcome");
  unmount();
  const freshClient = new QueryClient();
  const freshTrpc = createTRPCOptionsProxy({
    client,
    queryClient: freshClient,
  });
  const freshHistory = createMemoryHistory({ initialEntries: ["/"] });
  const freshRouter = createRouter({
    routeTree,
    history: freshHistory,
    context: { queryClient: freshClient, trpc: freshTrpc },
  });
  onTestFinished(() => {
    freshHistory.destroy();
    freshClient.clear();
  });
  renderComponent(
    <QueryClientProvider client={freshClient}>
      <RouterProvider router={freshRouter} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Complete upload" }),
  ).toBeEnabled();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: "wizard.getWorkflowConfig" }),
  );
});
