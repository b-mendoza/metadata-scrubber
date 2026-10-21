import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import {
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

const START_TIME = new Date("2026-10-21T12:00:00Z");
const GRANT_LIFETIME_MS = 900_000;
const FLUSH_MS = 1;
const TWO_REQUESTS = 2;
const NO_STORED_VALUES = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
});
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
          {/* eslint-disable-next-line better-tailwindcss/no-unknown-classes -- PostHog uses this class to exclude private workflow DOM. */}
          <main className="ph-no-capture">
            <FileWorkflowResult
              review={review}
              headingRef={(heading) => {
                heading?.focus();
              }}
            />
          </main>
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, frontend, queryClient, view };
}

test("result entry waits for one verified POST grant before enabling Download", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000301",
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/verified-grant",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const { backend, frontend, queryClient, view } = setupResult(input);
  const response = Promise.withResolvers<Response>();
  backend.mockReturnValueOnce(response.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  expect(
    screen.getByRole("status", { name: "Checking download link" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledOnce();
  act(() => {
    response.resolve(Response.json(grant));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  const download = screen.getByRole("link", { name: "Download PDF" });
  expect(download).toHaveAttribute("href", grant.downloadUrl);
  expect(download).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(download).not.toHaveAttribute("download");
  expect(screen.getByRole("main")).toContainElement(download);
  const [[request] = []] = backend.mock.calls;
  expect.assert(request != null);
  expect(request.method).toBe("POST");
  expect(await request.json()).toEqual(input);
  expect(request.url).toBe("https://backend.test/api/files/download-grant");
  const [[url, options] = []] = frontend.mock.calls;
  expect(url).toBe(
    "https://frontend.test/api/trpc/wizard.refreshDownloadGrant?batch=1",
  );
  expect(options?.method).toBe("POST");
  expect(location.search).toBe("");
  expect(localStorage).toHaveLength(NO_STORED_VALUES);
  expect(sessionStorage).toHaveLength(NO_STORED_VALUES);
  unmount();
  queryClient.clear();
});

test("hidden expiry disables the link without scheduled renewal and return refreshes it once", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000302",
    etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/first-grant",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const renewed: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/return-grant",
    expiresAt: "2026-10-21T12:30:00Z",
  };
  const { backend, queryClient, view } = setupResult(input);
  const response = Promise.withResolvers<Response>();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(response.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    grant.downloadUrl,
  );
  visibility.mockReturnValue("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  expect(backend).toHaveBeenCalledOnce();
  visibility.mockReturnValue("visible");
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  act(() => {
    response.resolve(Response.json(renewed));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    renewed.downloadUrl,
  );
  unmount();
  queryClient.clear();
});

test("Download rechecks the clock and blocks expired navigation before one refresh", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000303",
    etag: "cccccccccccccccccccccccccccccccc",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/clock-jump-grant",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const { backend, queryClient, view } = setupResult(input);
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(response.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  const download = screen.getByRole("link", { name: "Download PDF" });
  vi.setSystemTime(new Date(grant.expiresAt));
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    download.dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  unmount();
  queryClient.clear();
});

test.each([NOT_FOUND_STATUS_CODE, SERVICE_UNAVAILABLE_STATUS_CODE])(
  "grant failure %i offers safe recovery with no usable link",
  async (status) => {
    const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000304",
      etag: "dddddddddddddddddddddddddddddddd",
    };
    const error: BackendErrorResponse = {
      error: "private-grant-provider-detail",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/retried-grant",
      expiresAt: "2026-10-21T12:15:00Z",
    };
    const { backend, queryClient, view } = setupResult(input);
    backend
      .mockResolvedValueOnce(Response.json(error, { status }))
      .mockResolvedValueOnce(Response.json(grant));
    const { unmount } = renderComponent(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("alert"),
    );
    const refresh = screen.getByRole("button", {
      name: "Refresh download link",
    });
    act(() => {
      refresh.click();
      refresh.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      grant.downloadUrl,
    );
    unmount();
    queryClient.clear();
  },
);

test("a grant that already expired stays unusable and a late response after view exit is ignored", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000305",
    etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
  const expired: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/already-expired",
    expiresAt: "2026-10-21T11:59:59Z",
  };
  const valid: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/late-grant",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const { backend, queryClient, view } = setupResult(input);
  const response = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(expired))
    .mockReturnValueOnce(response.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  const refresh = screen.getByRole("button", { name: "Refresh download link" });
  act(() => {
    refresh.click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  unmount();
  act(() => {
    response.resolve(Response.json(valid));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(
    screen.queryByRole("link", { name: "Download PDF" }),
  ).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  queryClient.clear();
});
