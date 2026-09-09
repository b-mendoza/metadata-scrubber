import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen, waitFor } from "@testing-library/react";
import type { Operation } from "@trpc/client";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import ky from "ky";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { Route as RootRoute } from "#/routes/__root";
import { routeTree } from "#/routeTree.gen";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));
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
const ONE_REQUEST = 1;
const FAILURES = [
  {
    code: "NOT_FOUND",
    status: 404,
    kind: "missing-source",
    message: "The PDF is no longer available. Upload the PDF again.",
  },
  {
    code: "CONFLICT",
    status: 409,
    kind: "conflict",
    message: "The PDF revision changed. Start a new upload.",
  },
  {
    code: "UNPROCESSABLE_CONTENT",
    status: 422,
    kind: "signed",
    message: "Signed PDFs are unsupported in v1.",
  },
  {
    code: "BAD_GATEWAY",
    status: 502,
    kind: "error",
    message: "Could not complete the PDF operation. Start a new upload.",
  },
] as const;
const LOADER_FAILURES = FAILURES.flatMap((failure) =>
  (["review", "result"] as const).map((step) => ({ ...failure, step })),
);
const NO_REQUESTS = 0;
beforeEach(() => {
  request.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["client", "server"] as const)("%s loader errors", (mode) => {
  test.each(LOADER_FAILURES)(
    "$step maps $code to $kind without replay",
    async ({ step, code, status, kind, message }) => {
      const queryClient = new QueryClient();
      const revision: RouterInputs["wizard"]["scrubFile"] = {
        storageKey: "uploads/00000000-0000-4000-8000-000000000001",
        etag: "0123456789abcdef0123456789abcdef",
      };
      const search =
        step === "review" ? { storageKey: revision.storageKey } : revision;
      const history = createMemoryHistory({
        initialEntries: [`/${step}?${new URLSearchParams(search)}`],
      });
      const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
        maxFileSizeBytes: 10_485_760,
      };
      const failure = new TRPCClientError<AppRouter>("provider-secret", {
        result: {
          error: {
            code: -32_603,
            message: "provider-secret",
            data: { code, httpStatus: status },
          },
        },
      });
      request.mockRejectedValueOnce(failure).mockResolvedValue(config);
      const backendBody: BackendErrorResponse = { error: "provider-secret" };
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(backendBody, {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValue(Response.json(config));
      vi.stubGlobal("fetch", fetchMock);
      const backend = new URL("https://backend.test/");
      vi.mocked(getAppBindings).mockReturnValue({
        httpClient: ky.create({ baseUrl: backend }),
        workflowHttpClient: createWorkflowHttpClient(backend),
      });
      const trpc = createTRPCOptionsProxy(
        mode === "client"
          ? { client, queryClient }
          : {
              router: appRouter,
              ctx: () =>
                createTRPCRequestContext(new Request("https://frontend.test/")),
              queryClient,
            },
      );
      const router = createRouter({
        routeTree,
        history,
        context: { queryClient, trpc },
      });
      const actions: string[] = [];
      const unsubscribe = history.subscribe(({ action }) => {
        actions.push(action.type);
      });
      const { user, unmount } = renderComponent(
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
      expect(
        await screen.findByRole("heading", { name: message }),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe("/outcome");
      expect(router.state.location.search).toEqual({ kind });
      expect(actions).toContain("REPLACE");
      expect(screen.queryByText("provider-secret")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Scrub it" }),
      ).not.toBeInTheDocument();
      if (mode === "client") expect(request).toHaveBeenCalledOnce();
      else expect(fetchMock).toHaveBeenCalledOnce();
      if (kind === "signed") {
        expect(
          screen.getByText(
            "Files are automatically deleted within up to 48 hours.",
          ),
        ).toBeVisible();
      }
      await user.click(
        screen.getByRole("button", { name: "Start new upload" }),
      );
      await screen.findByRole("heading", { name: "Upload a PDF" });
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toEqual({});
      if (kind === "missing-source") {
        expect(screen.getByRole("alert")).toHaveTextContent(message);
      }
    },
  );
});

test.each(FAILURES)(
  "scrub maps $code to $kind",
  async ({ code, status, kind, message }) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const search: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    };
    const history = createMemoryHistory({
      initialEntries: [`/review?${new URLSearchParams(search)}`],
    });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient, trpc },
    });
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
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 10_485_760,
    };
    request
      .mockResolvedValueOnce(inspected)
      .mockRejectedValueOnce(
        new TRPCClientError<AppRouter>("provider-secret", {
          result: {
            error: {
              code: -32_603,
              message: "provider-secret",
              data: { code, httpStatus: status },
            },
          },
        }),
      )
      .mockResolvedValue(config);
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
    expect(await screen.findByRole("heading", { name: message })).toBeVisible();
    expect(router.state.location.pathname).toBe("/outcome");
    expect(router.state.location.search).toEqual({ kind });
    expect(
      request.mock.calls.filter(
        ([operation]) => operation.path === "wizard.scrubFile",
      ),
    ).toHaveLength(ONE_REQUEST);
    expect(screen.queryByText("provider-secret")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start new upload" }));
    await screen.findByRole("heading", { name: "Upload a PDF" });
    expect(router.state.location.search).toEqual({});
  },
);

test("a missing notice survives restart, can be dismissed, and returns on another entry", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  const search = { kind: "missing-source" } as const;
  const history = createMemoryHistory({
    initialEntries: [`/outcome?${new URLSearchParams(search)}`],
  });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, trpc },
  });
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 10_485_760,
  };
  request.mockResolvedValue(config);
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
  await screen.findByRole("heading", {
    name: "The PDF is no longer available. Upload the PDF again.",
  });
  expect(request.mock.calls).toHaveLength(NO_REQUESTS);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The PDF is no longer available.",
  );
  await user.click(screen.getByRole("button", { name: "Start new upload" }));
  await screen.findByRole("heading", { name: "Upload a PDF" });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The PDF is no longer available.",
  );
  await user.click(screen.getByRole("button", { name: "Dismiss notice" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate({ to: "/outcome", search, replace: true });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The PDF is no longer available.",
  );
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
  request.mockResolvedValueOnce(inspected);
  await act(async () => {
    await router.navigate({
      to: "/review",
      search: { storageKey: "uploads/00000000-0000-4000-8000-000000000001" },
      replace: true,
    });
  });
  await screen.findByRole("button", { name: "Scrub it" });
  await waitFor(() => {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
