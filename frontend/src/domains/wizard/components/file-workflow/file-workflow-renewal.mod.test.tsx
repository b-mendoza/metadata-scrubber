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
const THREE_REQUESTS = 3;
const ONE_MINUTE_MS = 60_000;
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

test("active results renew exactly 120 seconds before each authoritative expiry", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000501",
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/initial",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const renewed: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/renewed",
    expiresAt: "2026-10-21T12:28:00Z",
  };
  const { backend, frontend, queryClient, view } = setupResult(input);
  const response = Promise.withResolvers<Response>();
  const nextResponse = Promise.withResolvers<Response>();
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(response.promise)
    .mockReturnValueOnce(nextResponse.promise);
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    await vi.advanceTimersByTimeAsync(
      Date.parse("2026-10-21T12:12:59.999Z") - Date.now(),
    );
  });
  expect(backend).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(
    screen.getByRole("status", { name: "Checking download link" }),
  ).toBeVisible();
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
    await vi.advanceTimersByTimeAsync(
      Date.parse("2026-10-21T12:25:59.999Z") - Date.now(),
    );
  });
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  const download = screen.getByRole("link", { name: "Download PDF" });
  expect(download).toHaveAttribute("href", renewed.downloadUrl);
  expect(download).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
  await Promise.all(
    backend.mock.calls.map(async ([request]) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://backend.test/api/files/download-grant");
      expect(await request.json()).toEqual(input);
    }),
  );
  for (const [url, options] of frontend.mock.calls) {
    expect(url).toBe(
      "https://frontend.test/api/trpc/wizard.refreshDownloadGrant?batch=1",
    );
    expect(options?.method).toBe("POST");
  }
  expect(location.search).toBe("");
  expect(localStorage).toHaveLength(NO_STORED_VALUES);
  expect(sessionStorage).toHaveLength(NO_STORED_VALUES);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(
    screen.getByRole("status", { name: "Checking download link" }),
  ).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(backend).toHaveBeenCalledTimes(THREE_REQUESTS);
  unmount();
  queryClient.clear();
});

test.each(["hidden on entry", "hidden before renewal"] as const)(
  "%s sends no scheduled request until the visible result returns",
  async (mode) => {
    const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000502",
      etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/hidden",
      expiresAt: "2026-10-21T12:15:00Z",
    };
    const { backend, queryClient, view } = setupResult(input);
    const response = Promise.withResolvers<Response>();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue(
      mode === "hidden on entry" ? "hidden" : "visible",
    );
    backend
      .mockResolvedValueOnce(Response.json(grant))
      .mockReturnValueOnce(response.promise);
    const { unmount } = renderComponent(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(ONE_MINUTE_MS);
    });
    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        Date.parse("2026-10-21T12:14:00Z") - Date.now(),
      );
    });
    act(() => {
      dispatchEvent(new Event("focus"));
      dispatchEvent(new Event("pageshow"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(backend).toHaveBeenCalledOnce();
    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      dispatchEvent(new Event("focus"));
      dispatchEvent(new Event("pageshow"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    unmount();
    queryClient.clear();
  },
);

test("leaving the result cancels scheduled renewal and return listeners", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000503",
    etag: "cccccccccccccccccccccccccccccccc",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/unmounted",
    expiresAt: "2026-10-21T12:15:00Z",
  };
  const { backend, queryClient, view } = setupResult(input);
  backend.mockResolvedValueOnce(Response.json(grant));
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  unmount();
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(backend).toHaveBeenCalledOnce();
  queryClient.clear();
});

test.each([NOT_FOUND_STATUS_CODE, SERVICE_UNAVAILABLE_STATUS_CODE])(
  "scheduled failure %i keeps private data out of the page and does not retry automatically",
  async (status) => {
    const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000504",
      etag: "dddddddddddddddddddddddddddddddd",
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/failed-renewal",
      expiresAt: "2026-10-21T12:15:00Z",
    };
    const error: BackendErrorResponse = { error: "private-renewal-detail" };
    const { backend, queryClient, view } = setupResult(input);
    backend
      .mockResolvedValueOnce(Response.json(grant))
      .mockResolvedValueOnce(Response.json(error, { status }));
    const { unmount } = renderComponent(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(
        Date.parse("2026-10-21T12:13:00Z") - Date.now(),
      );
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("alert"),
    );
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(error.error)).not.toBeInTheDocument();
    expect(screen.queryByText(input.storageKey)).not.toBeInTheDocument();
    expect(screen.queryByText(input.etag)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh download link" }),
    ).toBeEnabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
    });
    expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
    expect(localStorage).toHaveLength(NO_STORED_VALUES);
    expect(sessionStorage).toHaveLength(NO_STORED_VALUES);
    unmount();
    queryClient.clear();
  },
);

test("a renewal with the same near expiry cannot start a renewal loop", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000505",
    etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/short-grant",
    expiresAt: "2026-10-21T12:01:00Z",
  };
  const repeated: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/repeated-expiry",
    expiresAt: grant.expiresAt,
  };
  const { backend, queryClient, view } = setupResult(input);
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockResolvedValueOnce(Response.json(repeated));
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    repeated.downloadUrl,
  );
  act(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ONE_MINUTE_MS);
  });
  expect(backend).toHaveBeenCalledTimes(TWO_REQUESTS);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  unmount();
  queryClient.clear();
});
