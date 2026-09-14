import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen } from "@testing-library/react";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import type { WorkflowOutput } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { createTestTRPCClient } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { Route as RootRoute } from "#/routes/__root";
import { loadResult } from "#/routes/_wizard.result";
import { loadReview } from "#/routes/_wizard.review";
import { routeTree } from "#/routeTree.gen";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

Object.assign(RootRoute.options, {
  shellComponent: ({ children }: React.PropsWithChildren) => <>{children}</>,
});
const { request, client } = createTestTRPCClient();
const TWO_REQUESTS = 2;
const EVENT_LISTENER_INDEX = 1;
const EMPTY_QUERY_COUNT = 0;
const GRANT_LIFETIME_MS = 120_000;
const RENEWAL_TIME_MS = 90_000;
const FLUSH_MS = 0;
beforeEach(() => {
  request.mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
});

test.each(["review", "result"] as const)(
  "%s abort settles before the pending response and releases its listeners",
  async (step) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const loader = step === "review" ? loadReview : loadResult;
    const loaderDependencies: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const abortController = new AbortController();
    const removeListener = vi.spyOn(
      abortController.signal,
      "removeEventListener",
    );
    const addListener = vi.spyOn(abortController.signal, "addEventListener");
    const pending = Promise.withResolvers<WorkflowOutput>();
    request.mockReturnValueOnce(pending.promise);
    const operation = loader({
      abortController,
      context: { trpc },
      deps: loaderDependencies,
    });
    const settled = vi.fn();
    void Promise.resolve(operation).then(settled).catch(settled);
    onTestFinished(() => {
      abortController.abort();
      pending.reject(new Error("released pending transport"));
      queryClient.clear();
    });
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledOnce();
    });
    const [firstRequest] = request.mock.calls;
    abortController.abort();
    expect(firstRequest).toMatchObject([{ signal: { aborted: true } }]);
    await vi.waitFor(() => {
      expect(settled).toHaveBeenCalledOnce();
    });
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    const abortRegistration = addListener.mock.calls.find(
      ([event]) => event === "abort",
    );
    expect(abortRegistration).toBeDefined();
    expect(removeListener).toHaveBeenCalledWith(
      "abort",
      abortRegistration?.[EVENT_LISTENER_INDEX],
    );
    expect(focusManager.hasListeners()).toBe(false);
    expect(onlineManager.hasListeners()).toBe(false);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(
      EMPTY_QUERY_COUNT,
    );
  },
);
test.each(["review-loader", "result-loader"] as const)(
  "exit during %s keeps the newer route",
  async (boundary) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const isReview = boundary === "review-loader";
    const search = isReview ? { storageKey: revision.storageKey } : revision;
    const history = createMemoryHistory({
      initialEntries: [
        `/${isReview ? "review" : "result"}?${new URLSearchParams(search)}`,
      ],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
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
    await act(async () => {
      await router.navigate({
        to: "/outcome",
        search: { kind: "clean" },
        replace: true,
      });
    });
    act(() => {
      pending.reject(new Error("abandoned loader"));
    });
    expect(router.state.location.pathname).toBe("/outcome");
    expect(router.state.location.search).toEqual({ kind: "clean" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const requestsBeforeExit = request.mock.calls.length;
    vi.useFakeTimers();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
    });
    expect(request.mock.calls).toHaveLength(requestsBeforeExit);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
  },
);
test("exit during scrub keeps the newer route", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const revision: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    etag: "0123456789abcdef0123456789abcdef",
  };
  const search = { storageKey: revision.storageKey };
  const history = createMemoryHistory({
    initialEntries: [`/review?${new URLSearchParams(search)}`],
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
        label: "Title",
        preview: "old",
        originalByteSize: 3,
        action: "remove",
      },
    ],
  };
  request.mockResolvedValueOnce(inspected).mockReturnValueOnce(pending.promise);
  const { user, unmount } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  onTestFinished(() => {
    unmount();
    queryClient.clear();
    history.destroy();
  });
  await user.click(await screen.findByRole("button", { name: "Scrub it" }));
  await act(async () => {
    await router.navigate({
      to: "/outcome",
      search: { kind: "clean" },
      replace: true,
    });
  });
  act(() => {
    pending.resolve({
      status: "done",
      result: { downloadUrl: "https://downloads.test/abandoned.pdf" },
    } satisfies RouterOutputs["wizard"]["scrubFile"]);
  });
  expect(router.state.location.pathname).toBe("/outcome");
  expect(router.state.location.search).toEqual({ kind: "clean" });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const requestsBeforeExit = request.mock.calls.length;
  vi.useFakeTimers();
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(request.mock.calls).toHaveLength(requestsBeforeExit);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
});
test.each(["renewal", "dialog", "deletion"] as const)(
  "exit during %s keeps the newer route",
  async (boundary) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const search = revision;
    const history = createMemoryHistory({
      initialEntries: [`/result?${new URLSearchParams(search)}`],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
    const pending = Promise.withResolvers<WorkflowOutput>();
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/entry.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    request.mockResolvedValueOnce(grant).mockReturnValueOnce(pending.promise);
    const { user, unmount } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    onTestFinished(() => {
      unmount();
      queryClient.clear();
      history.destroy();
    });
    await screen.findByRole("link", { name: "Download PDF" });
    if (boundary === "dialog" || boundary === "deletion") {
      await user.click(screen.getByRole("button", { name: "Delete files" }));
      if (boundary === "deletion") {
        await user.click(
          screen.getByRole("button", { name: "Confirm deletion" }),
        );
      }
    } else {
      vi.useFakeTimers();
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(RENEWAL_TIME_MS);
      });
      expect(request.mock.calls).toHaveLength(TWO_REQUESTS);
    }
    await act(async () => {
      await router.navigate({
        to: "/outcome",
        search: { kind: "clean" },
        replace: true,
      });
    });
    act(() => {
      if (boundary === "renewal") pending.resolve(grant);
      else {
        pending.resolve({
          status: "deleted",
        } satisfies RouterOutputs["wizard"]["confirmDelete"]);
      }
    });
    expect(router.state.location.pathname).toBe("/outcome");
    expect(router.state.location.search).toEqual({ kind: "clean" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const requestsBeforeExit = request.mock.calls.length;
    vi.useFakeTimers();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
    });
    expect(request.mock.calls).toHaveLength(requestsBeforeExit);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
  },
);
