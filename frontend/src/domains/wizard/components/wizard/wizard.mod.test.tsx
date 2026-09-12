import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen, waitFor } from "@testing-library/react";
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
import {
  FakeXMLHttpRequest,
  getFileInput,
  installXMLHttpRequestFake,
} from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
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

const RETRY_UPLOAD_NAME = /retry upload/iv;
const UPLOAD_LIMIT_TEXT = /10 MiB/v;
const UPLOAD_BUTTON_NAME = /upload 1 file/iv;
const INSPECTING_TEXT = /Inspecting/v;
const REPLACEMENT_TEXT = /Neutral replacement/v;
const SCRUBBING_TEXT = /Scrubbing/v;
const GRANT_DURATION_TEXT = /approximately 15 minutes/iv;
const SCOPE_TEXT = /does not remove all hidden PDF content/v;

const INITIAL_ATTEMPT_COUNT = 1;
const UPLOAD_ATTEMPT_COUNT = 2;
const INSPECTION_ATTEMPT_COUNT = 3;
const SCRUB_ATTEMPT_COUNT = 4;
const FIRST_GRANT_ATTEMPT_COUNT = 5;
const GRANT_LIFETIME_MS = 120_000;

const { request, client } = createTestTRPCClient();

beforeEach(() => {
  request.mockReset();
  vi.mocked(FileUploader).mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.reset();
});

test("a direct PUT leads to honest review and revision-bound scrub, including duplicate success", async () => {
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
  installXMLHttpRequestFake();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  const grant: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    uploadUrl: "https://uploads.test/source.pdf",
  };
  const inspected: RouterOutputs["wizard"]["dryRun"] = {
    etag: "0123456789abcdef0123456789abcdef",
    fields: [
      {
        name: "title",
        label: "Document title",
        preview: "é",
        originalByteSize: 2,
        action: "remove",
      },
      {
        name: "custom",
        label: "<b>Private</b>",
        preview: "é",
        originalByteSize: 4,
        action: "replace",
      },
    ],
  };
  const done: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/scrubbed.pdf" },
  };
  const { promise: inspectionPromise, resolve: resolveInspection } =
    Promise.withResolvers<RouterOutputs["wizard"]["dryRun"]>();
  const { promise: scrubPromise, resolve: resolveScrub } =
    Promise.withResolvers<RouterOutputs["wizard"]["scrubFile"]>();
  request
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(grant)
    .mockReturnValueOnce(inspectionPromise)
    .mockReturnValueOnce(scrubPromise)
    .mockResolvedValueOnce({
      downloadUrl: "https://downloads.test/loader.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    } satisfies RouterOutputs["wizard"]["refreshDownloadGrant"]);
  const localWrite = vi.spyOn(Storage.prototype, "setItem");
  const writes: string[] = [];
  const unsubscribe = history.subscribe(({ location }) => {
    writes.push(JSON.stringify(location));
  });
  onTestFinished(unsubscribe);
  const { user } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByText(UPLOAD_LIMIT_TEXT);
  const file = new File(["%PDF"], "private.pdf", { type: "application/pdf" });
  await user.upload(await getFileInput(user), file);
  await user.click(screen.getByRole("button", { name: UPLOAD_BUTTON_NAME }));
  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(INITIAL_ATTEMPT_COUNT);
  });
  const [put] = FakeXMLHttpRequest.requests;
  if (put == null) throw new Error("The direct PUT is missing");
  expect(put.url).toBe(grant.uploadUrl);
  expect(put.method).toBe("PUT");
  expect(put.body).toBe(file);
  await act(async () => {
    await put.respond({ status: 200, headers: { ETag: '"uploaded"' } });
  });
  expect(await screen.findByRole("status")).toHaveTextContent(INSPECTING_TEXT);
  expect(request).toHaveBeenNthCalledWith(
    UPLOAD_ATTEMPT_COUNT,
    expect.objectContaining({
      path: "wizard.createUpload",
      input: { fileName: file.name, fileSizeBytes: file.size },
    }),
  );
  expect(request).toHaveBeenNthCalledWith(
    INSPECTION_ATTEMPT_COUNT,
    expect.objectContaining({
      path: "wizard.dryRun",
      input: { storageKey: grant.storageKey },
    }),
  );
  await act(async () => {
    resolveInspection(inspected);
    await inspectionPromise;
  });
  expect(await screen.findByText("Document title")).toBeVisible();
  expect(screen.getByText("<b>Private</b>")).toBeVisible();
  expect(screen.getByRole("table")).not.toContainHTML("<b>Private</b>");
  expect(screen.getAllByText("Shortened preview")).toHaveLength(
    INITIAL_ATTEMPT_COUNT,
  );
  expect(screen.getByText(REPLACEMENT_TEXT)).toBeVisible();
  expect(screen.queryByText(inspected.etag)).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/review");
  expect(router.state.location.search).toEqual({
    storageKey: grant.storageKey,
  });
  const scrubButton = screen.getByRole("button", { name: "Scrub it" });
  expect(scrubButton).toAppearBefore(
    screen.getByText("Files are automatically deleted within up to 48 hours."),
  );
  act(() => {
    scrubButton.click();
    scrubButton.click();
  });
  await waitFor(() => {
    expect(scrubButton).toBeDisabled();
  });
  expect(screen.getByRole("status")).toHaveTextContent(SCRUBBING_TEXT);
  await waitFor(() => {
    expect(request).toHaveBeenCalledTimes(SCRUB_ATTEMPT_COUNT);
  });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: "wizard.scrubFile",
      input: { storageKey: grant.storageKey, etag: inspected.etag },
    }),
  );
  await act(async () => {
    resolveScrub(done);
    await scrubPromise;
  });
  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", "https://downloads.test/loader.pdf");
  await waitFor(() => {
    expect(request).toHaveBeenCalledTimes(FIRST_GRANT_ATTEMPT_COUNT);
  });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: "wizard.refreshDownloadGrant",
      type: "query",
      input: { storageKey: grant.storageKey, etag: inspected.etag },
    }),
  );
  expect(localWrite).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe("/result");
  expect(router.state.location.search).toEqual({
    storageKey: grant.storageKey,
    etag: inspected.etag,
  });
  for (const write of writes) {
    expect(write).not.toContain(file.name);
    expect(write).not.toContain(done.result.downloadUrl);
    expect(write).not.toContain("Private");
  }
  expect(screen.getByText(GRANT_DURATION_TEXT)).toBeVisible();
  expect(screen.getByText(SCOPE_TEXT)).toBeVisible();
  act(() => {
    history.back();
  });
  await screen.findByRole("heading", {
    name: "This PDF is already clean. No supported metadata needs removal.",
  });
  expect(router.state.location.pathname).toBe("/outcome");
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
});

test("duplicate upload callbacks start one inspection and an empty review is terminal", async () => {
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
  vi.mocked(FileUploader).mockImplementation(({ onUploadComplete }) => (
    <button
      type="button"
      onClick={() => {
        onUploadComplete({
          storageKey: "uploads/00000000-0000-4000-8000-000000000001",
        });
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
    fields: [],
  };
  request.mockResolvedValueOnce(config).mockResolvedValueOnce(inspected);
  const { user } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Complete upload" }),
  );
  expect(
    await screen.findByText(
      "This PDF is already clean. No supported metadata needs removal.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText("Files are automatically deleted within up to 48 hours."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Scrub it" }),
  ).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(UPLOAD_ATTEMPT_COUNT);
  expect(router.state.location.pathname).toBe("/outcome");
  expect(router.state.location.search).toEqual({ kind: "clean" });
});

test.each(["grant", "PUT"] as const)(
  "%s failure keeps the real uploader without inspection",
  async (failure) => {
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
    installXMLHttpRequestFake();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 10_485_760,
    };
    const grant: RouterOutputs["wizard"]["createUpload"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      uploadUrl: "https://uploads.test/failing.pdf",
    };
    request.mockResolvedValueOnce(config);
    if (failure === "grant") {
      request.mockRejectedValueOnce(
        new Error("Could not create the upload grant"),
      );
    } else request.mockResolvedValueOnce(grant);
    const { user } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByText(UPLOAD_LIMIT_TEXT);
    await user.upload(
      await getFileInput(user),
      new File(["pdf"], "report.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: UPLOAD_BUTTON_NAME }));
    if (failure === "PUT") {
      await waitFor(() => {
        expect(FakeXMLHttpRequest.requests).toHaveLength(INITIAL_ATTEMPT_COUNT);
      });
      const [put] = FakeXMLHttpRequest.requests;
      if (put == null) throw new Error("Missing PUT");
      await act(async () => {
        await put.respond({ status: 400 });
      });
    }
    expect(
      await screen.findByRole("button", { name: RETRY_UPLOAD_NAME }),
    ).toBeVisible();
    expect(request).toHaveBeenCalledTimes(UPLOAD_ATTEMPT_COUNT);
    expect(
      screen.queryByRole("button", { name: "Scrub it" }),
    ).not.toBeInTheDocument();
  },
);
test("a pending config load keeps the heading, then a failed load retries", async () => {
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
  const { promise, reject } =
    Promise.withResolvers<RouterOutputs["wizard"]["getWorkflowConfig"]>();
  request.mockReturnValueOnce(promise);
  const { user } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "Upload a PDF" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading upload settings",
  );
  expect(vi.mocked(FileUploader)).not.toHaveBeenCalled();
  act(() => {
    reject(new Error("private config detail"));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load upload settings.",
  );
  expect(document.body).not.toHaveTextContent("private config detail");
  expect(screen.getByRole("heading", { name: "Upload a PDF" })).toBeVisible();
  request.mockResolvedValueOnce(config);
  await user.click(screen.getByRole("button", { name: "Retry settings" }));
  expect(await screen.findByText(UPLOAD_LIMIT_TEXT)).toBeVisible();
});
test("a cached config keeps the uploader through a failed refetch and retry", async () => {
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
  const { queryKey } = trpc.wizard.getWorkflowConfig.queryOptions();
  queryClient.setQueryData(queryKey, config);
  request.mockRejectedValueOnce(new Error("stale refetch"));
  const { user } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const heading = await screen.findByRole("heading", { name: "Upload a PDF" });
  const limit = screen.getByText(UPLOAD_LIMIT_TEXT);
  expect(limit).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
  await act(async () => {
    await queryClient.refetchQueries({ queryKey });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load upload settings.",
  );
  expect(document.body).not.toHaveTextContent("stale refetch");
  expect(screen.getByRole("heading", { name: "Upload a PDF" })).toBe(heading);
  expect(screen.getByText(UPLOAD_LIMIT_TEXT)).toBe(limit);
  request.mockResolvedValueOnce(config);
  await user.click(screen.getByRole("button", { name: "Retry settings" }));
  await waitFor(() => {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  expect(screen.getByRole("heading", { name: "Upload a PDF" })).toBe(heading);
  expect(screen.getByText(UPLOAD_LIMIT_TEXT)).toBe(limit);
});
