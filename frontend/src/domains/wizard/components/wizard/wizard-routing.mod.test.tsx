import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen } from "@testing-library/react";
import type { Operation } from "@trpc/client";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import { Route as RootRoute } from "#/routes/__root";
import { routeTree } from "#/routeTree.gen";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

Object.assign(RootRoute.options, {
  shellComponent: ({ children }: React.PropsWithChildren) => <>{children}</>,
});
type WorkflowOutput = RouterOutputs["wizard"][keyof RouterOutputs["wizard"]];
const request = vi.fn<(operation: Operation) => Promise<WorkflowOutput>>();
const client = createTRPCClient<AppRouter>({
  links: [
    () => (operation) =>
      observable((observer) => {
        void request(operation.op)
          .then((data) => {
            observer.next({ result: { data } });
            observer.complete();
          })
          .catch((error: unknown) => {
            observer.error(
              TRPCClientError.from(
                error instanceof Error
                  ? error
                  : new Error("Test transport failed"),
              ),
            );
          });
      }),
  ],
});
const TWO_REQUESTS = 2;
const GRANT_LIFETIME_MS = 120_000;
const NORMAL_STALE_MS = 60_000;
beforeEach(() => {
  request.mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
});

test.each([
  "/review",
  "/review?storageKey=bad",
  "/review?storageKey=42",
  "/review?storageKey=uploads%2F00000000-0000-4000-8000-000000000001&extra=secret",
  "/result",
  "/result?storageKey=uploads%2F00000000-0000-4000-8000-000000000001",
  "/result?etag=0123456789abcdef0123456789abcdef",
  "/result?storageKey=bad&etag=bad",
  "/result?storageKey=uploads%2F00000000-0000-4000-8000-000000000001&etag=42",
  "/result?storageKey=uploads%2F00000000-0000-4000-8000-000000000001&etag=0123456789abcdef0123456789abcdef&extra=secret",
  "/outcome",
  "/outcome?kind=invalid",
  "/outcome?kind=42",
  "/outcome?kind=clean&extra=secret",
])("search wire-contract rejects %s before file operations", async (url) => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, trpc },
  });
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  request.mockResolvedValue(config);
  const actions: string[] = [];
  const unsubscribe = history.subscribe(({ action }) => {
    actions.push(action.type);
  });
  const { unmount } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  onTestFinished(() => {
    unmount();
    queryClient.clear();
    unsubscribe();
    history.destroy();
  });
  await screen.findByRole("heading", { name: "Upload a PDF" });
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.search).toEqual({});
  expect(actions).toContain("REPLACE");
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ path: "wizard.getWorkflowConfig" }),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test.each(["review", "result"] as const)(
  "direct %s entry and fresh refresh reload the backend",
  async (step) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const search =
      step === "review" ? { storageKey: revision.storageKey } : revision;
    const history = createMemoryHistory({
      initialEntries: [`/${step}?${new URLSearchParams(search)}`],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
    const inspected: RouterOutputs["wizard"]["dryRun"] = {
      etag: revision.etag,
      fields: [
        {
          name: "title",
          label: "Private title",
          preview: "private",
          originalByteSize: 7,
          action: "remove",
        },
      ],
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/entry.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    request.mockResolvedValueOnce(step === "review" ? inspected : grant);
    const { unmount } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    onTestFinished(() => {
      unmount();
      queryClient.clear();
      history.destroy();
    });
    if (step === "review") {
      expect(await screen.findByText("Private title")).toBeVisible();
    } else {
      expect(
        await screen.findByRole("link", { name: "Download PDF" }),
      ).toHaveAttribute("href", grant.downloadUrl);
    }
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path:
          step === "review" ? "wizard.dryRun" : "wizard.refreshDownloadGrant",
        type: "query",
        input: search,
      }),
    );
    expect(router.state.location.search).toEqual(search);
    const { href } = router.state.location;
    unmount();
    queryClient.clear();
    const freshClient = new QueryClient();
    const freshTrpc = createTRPCOptionsProxy({
      client,
      queryClient: freshClient,
    });
    const freshHistory = createMemoryHistory({ initialEntries: [href] });
    const freshRouter = createRouter({
      routeTree,
      history: freshHistory,
      context: { queryClient: freshClient, trpc: freshTrpc },
    });
    request.mockRejectedValueOnce(
      new TRPCClientError<AppRouter>("gone", {
        result: {
          error: {
            code: -32_004,
            message: "gone",
            data: { code: "NOT_FOUND", httpStatus: 404 },
          },
        },
      }),
    );
    const view = renderComponent(
      <QueryClientProvider client={freshClient}>
        <RouterProvider router={freshRouter} />
      </QueryClientProvider>,
    );
    onTestFinished(() => {
      view.unmount();
      freshClient.clear();
      freshHistory.destroy();
    });
    await screen.findByRole("heading", {
      name: "The PDF is no longer available. Upload the PDF again.",
    });
    expect(freshRouter.state.location.pathname).toBe("/outcome");
    expect(freshRouter.state.location.search).toEqual({
      kind: "missing-source",
    });
    expect(request.mock.calls).toHaveLength(TWO_REQUESTS);
  },
);

test.each(["review", "result"] as const)(
  "%s ignores cached success while its current check is pending",
  async (step) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: NORMAL_STALE_MS } },
    });
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const search =
      step === "review" ? { storageKey: revision.storageKey } : revision;
    const history = createMemoryHistory({
      initialEntries: [`/${step}?${new URLSearchParams(search)}`],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
    const inspected: RouterOutputs["wizard"]["dryRun"] = {
      etag: revision.etag,
      fields: [
        {
          name: "title",
          label: "Old title",
          preview: "old",
          originalByteSize: 3,
          action: "remove",
        },
      ],
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/old.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    if (step === "review") {
      queryClient.setQueryData(
        trpc.wizard.dryRun.queryKey({ storageKey: revision.storageKey }),
        inspected,
      );
    } else {
      queryClient.setQueryData(
        trpc.wizard.refreshDownloadGrant.queryKey(revision),
        grant,
      );
    }
    const pending = Promise.withResolvers<WorkflowOutput>();
    request.mockReturnValueOnce(pending.promise);
    const { unmount } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    onTestFinished(() => {
      unmount();
      queryClient.clear();
      history.destroy();
    });
    await screen.findByRole("status");
    expect(request).toHaveBeenCalledOnce();
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    act(() => {
      pending.reject(
        new TRPCClientError<AppRouter>("gone", {
          result: {
            error: {
              code: -32_004,
              message: "gone",
              data: { code: "NOT_FOUND", httpStatus: 404 },
            },
          },
        }),
      );
    });
    await screen.findByRole("heading", {
      name: "The PDF is no longer available. Upload the PDF again.",
    });
    expect(router.state.location.search).toEqual({ kind: "missing-source" });
  },
);

test.each(["review", "result-key", "result-etag"] as const)(
  "%s changes load the new identifiers and ignore the old pending loader",
  async (change) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const step = change === "review" ? "/review" : "/result";
    const search =
      change === "review" ? { storageKey: revision.storageKey } : revision;
    const history = createMemoryHistory({
      initialEntries: [`${step}?${new URLSearchParams(search)}`],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
    const pending = Promise.withResolvers<WorkflowOutput>();
    const inspected: RouterOutputs["wizard"]["dryRun"] = {
      etag: revision.etag,
      fields: [
        {
          name: "title",
          label: "New title",
          preview: "new",
          originalByteSize: 3,
          action: "remove",
        },
      ],
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/new.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    request
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(change === "review" ? inspected : grant);
    const { unmount } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    onTestFinished(() => {
      unmount();
      queryClient.clear();
      history.destroy();
    });
    await screen.findByRole("status");
    const next: RouterInputs["wizard"]["scrubFile"] =
      change === "result-etag"
        ? { ...revision, etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
        : {
            ...revision,
            storageKey: "uploads/00000000-0000-4000-8000-000000000002",
          };
    await act(async () => {
      await (change === "review"
        ? router.navigate({
            to: "/review",
            search: { storageKey: next.storageKey },
            replace: true,
          })
        : router.navigate({ to: "/result", search: next, replace: true }));
    });
    act(() => {
      pending.reject(new Error("abandoned-provider-secret"));
    });
    expect(router.state.location.pathname).toBe(step);
    expect(router.state.location.search).toEqual(
      change === "review" ? { storageKey: next.storageKey } : next,
    );
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: change === "review" ? { storageKey: next.storageKey } : next,
      }),
    );
    if (change === "review") {
      expect(await screen.findByText("New title")).toBeVisible();
    } else {
      expect(await screen.findByRole("link")).toHaveAttribute(
        "href",
        grant.downloadUrl,
      );
    }
  },
);
