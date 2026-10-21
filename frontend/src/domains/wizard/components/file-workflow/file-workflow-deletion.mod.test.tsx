import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import {
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";
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

import { FileWorkflowResult } from "./file-workflow-screens.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const TWO_REQUESTS = 2;
const THREE_REQUESTS = 3;
const FOUR_REQUESTS = 4;
const ONE_PENDING = 1;
const NONE_PENDING = 0;
const DELETE_REQUEST_INDEX = 1;
const FLUSH_MS = 1;
const GRANT_LIFETIME_MS = 900_000;

afterEach(() => {
  vi.useRealTimers();
});

function setupResult(review: RouterInputs["wizard"]["refreshDownloadGrant"]) {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
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
          <FileWorkflowResult
            review={review}
            headingRef={(heading) => {
              heading?.focus();
            }}
          />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, queryClient, view };
}

test("confirmation focuses Cancel and keyboard cancellation sends no delete request", async () => {
  const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000401",
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/retained-grant",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const { backend, queryClient, view } = setupResult(review);
  backend.mockResolvedValueOnce(Response.json(grant));
  const { user, unmount } = renderComponent(view);
  await screen.findByRole("link", { name: "Download PDF" });
  await user.click(screen.getByRole("button", { name: "Delete files" }));
  expect(
    screen.getByRole("dialog", { name: "Confirm file deletion" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.tab();
  expect(
    screen.getByRole("button", { name: "Confirm deletion" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete files" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Delete files" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    grant.downloadUrl,
  );
  expect(backend).toHaveBeenCalledOnce();
  unmount();
  queryClient.clear();
});

test.each(["present", "already missing"] as const)(
  "duplicate confirmation for %s output waits for verified deletion",
  async (output) => {
    const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000402",
      etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/deleted-grant",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const missing: BackendErrorResponse = { error: "private-missing-output" };
    const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
      status: "deleted",
    };
    const { backend, queryClient, view } = setupResult(review);
    const response = Promise.withResolvers<Response>();
    backend
      .mockResolvedValueOnce(
        output === "present"
          ? Response.json(grant)
          : Response.json(missing, { status: NOT_FOUND_STATUS_CODE }),
      )
      .mockReturnValueOnce(response.promise);
    const { user, unmount } = renderComponent(view);
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(NONE_PENDING);
    });
    await user.click(screen.getByRole("button", { name: "Delete files" }));
    const confirm = screen.getByRole("button", { name: "Confirm deletion" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    act(() => {
      confirm.click();
      cancel.click();
      confirm.click();
    });
    expect(
      await screen.findByRole("status", { name: "Deleting files" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Deletion confirmed" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    });
    const [request] = backend.mock.calls[DELETE_REQUEST_INDEX] ?? [];
    expect.assert(request != null);
    const input: RouterInputs["wizard"]["confirmDelete"] = {
      storageKey: review.storageKey,
    };
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://backend.test/api/files/delete");
    expect(await request.json()).toEqual(input);
    act(() => {
      response.resolve(Response.json(deleted));
    });
    expect(
      await screen.findByRole("heading", { name: "Deletion confirmed" }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh download link" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete files" }),
    ).not.toBeInTheDocument();
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    unmount();
    queryClient.clear();
  },
);

test.each([CONFLICT_STATUS_CODE, SERVICE_UNAVAILABLE_STATUS_CODE])(
  "deletion failure %i retains an honest result and permits deliberate retry",
  async (status) => {
    const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000403",
      etag: "cccccccccccccccccccccccccccccccc",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/failure-grant",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const error: BackendErrorResponse = {
      error: "private-delete-provider-detail",
    };
    const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
      status: "deleted",
    };
    const { backend, queryClient, view } = setupResult(review);
    backend
      .mockResolvedValueOnce(Response.json(grant))
      .mockResolvedValueOnce(Response.json(error, { status }))
      .mockResolvedValueOnce(Response.json(grant))
      .mockResolvedValueOnce(Response.json(deleted));
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("link", { name: "Download PDF" });
    await user.click(screen.getByRole("button", { name: "Delete files" }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not confirm deletion. Files may remain. Try again.",
    );
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Deletion confirmed" }),
    ).not.toBeInTheDocument();
    await screen.findByRole("link", { name: "Download PDF" });
    await user.click(screen.getByRole("button", { name: "Retry deletion" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    expect(
      await screen.findByRole("heading", { name: "Deletion confirmed" }),
    ).toBeVisible();
    expect(backend).toHaveBeenCalledTimes(FOUR_REQUESTS);
    unmount();
    queryClient.clear();
  },
);

test.each(["grant first", "deletion first"] as const)(
  "%s completion cannot restore a deleted result",
  async (order) => {
    const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000404",
      etag: "dddddddddddddddddddddddddddddddd",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/late-deleted-grant",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
      status: "deleted",
    };
    const grantResponse = Promise.withResolvers<Response>();
    const deletionResponse = Promise.withResolvers<Response>();
    const { backend, queryClient, view } = setupResult(review);
    backend
      .mockReturnValueOnce(grantResponse.promise)
      .mockReturnValueOnce(deletionResponse.promise);
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("status", { name: "Checking download link" });
    await user.click(screen.getByRole("button", { name: "Delete files" }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => {
      expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    });
    act(() => {
      if (order === "grant first") {
        grantResponse.resolve(Response.json(grant));
      } else {
        deletionResponse.resolve(Response.json(deleted));
      }
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(ONE_PENDING);
    });
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    act(() => {
      if (order === "grant first") {
        deletionResponse.resolve(Response.json(deleted));
      } else {
        grantResponse.resolve(Response.json(grant));
      }
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(NONE_PENDING);
    });
    expect(
      screen.getByRole("heading", { name: "Deletion confirmed" }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh download link" }),
    ).not.toBeInTheDocument();
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    unmount();
    queryClient.clear();
  },
);

test("confirmed deletion stops scheduled renewal while pending and after success", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000506",
    etag: "ffffffffffffffffffffffffffffffff",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/before-delete",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
    status: "deleted",
  };
  const response = Promise.withResolvers<Response>();
  const { backend, queryClient, view } = setupResult(review);
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(response.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  const deletionButton = screen.getByRole("button", { name: "Delete files" });
  act(() => {
    deletionButton.click();
  });
  const confirmButton = screen.getByRole("button", {
    name: "Confirm deletion",
  });
  act(() => {
    confirmButton.click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(screen.getByRole("status", { name: "Deleting files" })).toBeVisible();
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  act(() => {
    response.resolve(Response.json(deleted));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(
    screen.getByRole("heading", { name: "Deletion confirmed" }),
  ).toHaveFocus();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  unmount();
  queryClient.clear();
});

test.each(["renewal first", "deletion first"] as const)(
  "%s completion rejects a late scheduled grant",
  async (order) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000507",
      etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/scheduled-before-delete",
      expiresAt: "2026-10-21T12:15:00Z",
    };
    const renewed: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/late-scheduled-deleted",
      expiresAt: "2026-10-21T12:28:00Z",
    };
    const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
      status: "deleted",
    };
    const renewalResponse = Promise.withResolvers<Response>();
    const deletionResponse = Promise.withResolvers<Response>();
    const { backend, queryClient, view } = setupResult(review);
    backend
      .mockResolvedValueOnce(Response.json(grant))
      .mockReturnValueOnce(renewalResponse.promise)
      .mockReturnValueOnce(deletionResponse.promise);
    const { unmount } = renderComponent(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(
        Date.parse("2026-10-21T12:13:00Z") - Date.now(),
      );
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    const deletionButton = screen.getByRole("button", { name: "Delete files" });
    act(() => {
      deletionButton.click();
    });
    const confirmButton = screen.getByRole("button", {
      name: "Confirm deletion",
    });
    act(() => {
      confirmButton.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    act(() => {
      if (order === "renewal first") {
        renewalResponse.resolve(Response.json(renewed));
      } else {
        deletionResponse.resolve(Response.json(deleted));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(queryClient.isMutating()).toBe(ONE_PENDING);
    act(() => {
      if (order === "renewal first") {
        deletionResponse.resolve(Response.json(deleted));
      } else {
        renewalResponse.resolve(Response.json(renewed));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
    });
    expect(queryClient.isMutating()).toBe(NONE_PENDING);
    expect(
      screen.getByRole("heading", { name: "Deletion confirmed" }),
    ).toHaveFocus();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(backend).toHaveBeenCalledTimes(THREE_REQUESTS);
    unmount();
    queryClient.clear();
  },
);
