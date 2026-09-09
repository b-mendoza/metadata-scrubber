import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react";
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

import { WizardResult } from "#/domains/wizard/components/wizard/wizard-result.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const FLUSH_MS = 0;
const INITIAL_ATTEMPT_COUNT = 1;
const SECOND_ATTEMPT_COUNT = 2;
const BEFORE_RENEWAL_MS = 89_999;
const RENEWAL_LEAD_MS = 30_000;
const GRANT_LIFETIME_MS = 120_000;
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
beforeEach(() => {
  request.mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
});
test("renewal follows authoritative expiry and disables links while a renewal is late", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  onTestFinished(() => {
    queryClient.clear();
  });
  const revision: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    etag: "0123456789abcdef0123456789abcdef",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/renewed.pdf",
    expiresAt: "2026-09-09T12:02:00Z",
  };
  const nextGrant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/next.pdf",
    expiresAt: "2026-09-09T12:04:00Z",
  };
  const { promise: renewalPromise, resolve: resolveRenewal } =
    Promise.withResolvers<RouterOutputs["wizard"]["refreshDownloadGrant"]>();
  const { promise: latePromise, reject: rejectLateRenewal } =
    Promise.withResolvers<RouterOutputs["wizard"]["refreshDownloadGrant"]>();
  request.mockReturnValueOnce(renewalPromise).mockReturnValueOnce(latePromise);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
  renderComponent(
    <QueryClientProvider client={queryClient}>
      <WizardResult
        revision={revision}
        initialDownloadUrl={grant.downloadUrl}
        initialExpiresAt={grant.expiresAt}
        trpc={trpc}
        queryClient={queryClient}
        onRestart={vi.fn<() => void>()}
      />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    grant.downloadUrl,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(BEFORE_RENEWAL_MS);
  });
  expect(request).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INITIAL_ATTEMPT_COUNT);
  });
  expect(request).toHaveBeenCalledTimes(INITIAL_ATTEMPT_COUNT);
  expect(screen.getByRole("status")).toHaveTextContent("Renewing download");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RENEWAL_LEAD_MS);
  });
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  await act(async () => {
    resolveRenewal(nextGrant);
    await renewalPromise;
  });
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    nextGrant.downloadUrl,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(request).toHaveBeenCalledTimes(SECOND_ATTEMPT_COUNT);
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  await act(async () => {
    rejectLateRenewal(new Error("private provider details"));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not renew the download.",
  );
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  await act(async () => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(request).toHaveBeenCalledTimes(SECOND_ATTEMPT_COUNT);
  const manualGrant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/manual.pdf",
    expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
  };
  request.mockResolvedValueOnce(manualGrant);
  fireEvent.click(screen.getByRole("button", { name: "Renew download" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    manualGrant.downloadUrl,
  );
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: "wizard.refreshDownloadGrant",
      type: "query",
      input: revision,
    }),
  );
});

test.each(["expired", "short", "missing"] as const)(
  "%s grant does not cause a renewal loop",
  async (boundary) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    onTestFinished(() => {
      queryClient.clear();
    });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/short.pdf",
      expiresAt:
        boundary === "short" ? "2026-09-09T12:00:20Z" : "2026-09-09T12:00:00Z",
    };
    if (boundary === "missing") {
      request.mockRejectedValueOnce(
        new TRPCClientError<AppRouter>("provider-secret", {
          result: {
            error: {
              code: -32_004,
              message: "provider-secret",
              data: { code: "NOT_FOUND", httpStatus: 404 },
            },
          },
        }),
      );
    } else request.mockResolvedValueOnce(grant);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    renderComponent(
      <QueryClientProvider client={queryClient}>
        <WizardResult
          revision={revision}
          initialDownloadUrl={grant.downloadUrl}
          initialExpiresAt="2026-09-09T11:59:59Z"
          trpc={trpc}
          queryClient={queryClient}
          onRestart={vi.fn<() => void>()}
        />
      </QueryClientProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
    });

    expect(request).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    if (boundary === "missing") {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The scrubbed PDF is missing.",
      );
    } else if (boundary === "expired") {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not renew the download.",
      );
    }
  },
);

test("hidden view stops renewal, expired return renews, and exit ignores stale completion", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  onTestFinished(() => {
    queryClient.clear();
  });
  const revision: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    etag: "0123456789abcdef0123456789abcdef",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/grant.pdf",
    expiresAt: "2026-09-09T12:02:00Z",
  };
  const next =
    Promise.withResolvers<RouterOutputs["wizard"]["refreshDownloadGrant"]>();
  request.mockReturnValueOnce(next.promise);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
  const visibility = vi.spyOn(document, "visibilityState", "get");
  const { unmount } = renderComponent(
    <QueryClientProvider client={queryClient}>
      <WizardResult
        revision={revision}
        initialDownloadUrl={grant.downloadUrl}
        initialExpiresAt={grant.expiresAt}
        trpc={trpc}
        queryClient={queryClient}
        onRestart={vi.fn<() => void>()}
      />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  visibility.mockReturnValue("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  visibility.mockReturnValue("visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(request).toHaveBeenCalledOnce();
  unmount();
  await act(async () => {
    next.resolve(grant);
    await next.promise;
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(FLUSH_MS);
  expect(request).toHaveBeenCalledOnce();
});

test.each(["deleted", "already missing", "CONFLICT"] as const)(
  "confirmed deletion handles %s and rejects a late grant",
  async (outcome) => {
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    onTestFinished(() => {
      queryClient.clear();
    });
    const revision: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000001",
      etag: "0123456789abcdef0123456789abcdef",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/late.pdf",
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS).toISOString(),
    };
    const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
      status: "deleted",
    };
    const refresh =
      Promise.withResolvers<RouterOutputs["wizard"]["refreshDownloadGrant"]>();
    const deletion =
      Promise.withResolvers<RouterOutputs["wizard"]["confirmDelete"]>();
    request
      .mockReturnValueOnce(refresh.promise)
      .mockReturnValueOnce(deletion.promise);
    const onRestart = vi.fn<() => void>();
    const { user } = renderComponent(
      <QueryClientProvider client={queryClient}>
        <WizardResult
          revision={revision}
          initialDownloadUrl={grant.downloadUrl}
          initialExpiresAt={new Date(Date.now()).toISOString()}
          trpc={trpc}
          queryClient={queryClient}
          onRestart={onRestart}
        />
      </QueryClientProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await user.click(screen.getByRole("button", { name: "Delete files" }));
    expect(
      screen.getByRole("dialog", { name: "Delete both files?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete files" })).toHaveFocus();
    expect(request).toHaveBeenCalledOnce();
    await user.keyboard("{Enter}");
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(screen.getByRole("button", { name: "Delete files" })).toHaveFocus();
    expect(request).toHaveBeenCalledOnce();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Confirm deletion" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Deleting files");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(SECOND_ATTEMPT_COUNT);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "wizard.confirmDelete",
        input: { storageKey: revision.storageKey },
      }),
    );
    await act(async () => {
      refresh.resolve(grant);
      await refresh.promise;
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    if (outcome === "CONFLICT") {
      const failure = new TRPCClientError<AppRouter>(
        "private provider detail",
        {
          result: {
            error: {
              code: -32_009,
              message: "private provider detail",
              data: { code: "CONFLICT", httpStatus: 409 },
            },
          },
        },
      );
      const rejected = expect(deletion.promise).rejects.toBe(failure);
      await act(async () => {
        deletion.reject(failure);
        await rejected;
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Deletion was not confirmed.",
      );
      expect(onRestart).not.toHaveBeenCalled();
    } else {
      await act(async () => {
        deletion.resolve(deleted);
        await deletion.promise;
      });
      expect(onRestart).toHaveBeenCalledOnce();
    }
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Renew download" }),
    ).not.toBeInTheDocument();
  },
);
