import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

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

const FOUR_REQUESTS = 4;
const FIVE_REQUESTS = 5;
const EIGHT_REQUESTS = 8;
const FLUSH_MS = 1;
const NO_LINKS = 0;
const ONE_LINK = 1;
const GRANT_LIFETIME_MS = 900_000;

afterEach(() => {
  vi.useRealTimers();
});

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

test("restart before renewal cancels the old result schedule", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  const { backend, queryClient, uploader, view } = setupWorkflow();
  const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 4,
  };
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000508",
  };
  const review: RouterOutputs["wizard"]["dryRun"] = {
    etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fields: [],
  };
  const result: RouterOutputs["wizard"]["scrubFile"] = {
    status: "done",
    result: { downloadUrl: "https://downloads.test/restart-before-due" },
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: result.result.downloadUrl,
    expiresAt: "2026-10-21T12:15:00Z",
  };
  backend
    .mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json(result))
    .mockResolvedValueOnce(Response.json(grant));
  const { unmount } = renderComponent(view);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  const oldUploader = uploader.current;
  expect.assert(oldUploader != null);
  act(() => {
    oldUploader.onUploadComplete(input);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  const scrubButton = screen.getByRole("button", { name: "Scrub it" });
  act(() => {
    scrubButton.click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link", { name: "Download PDF" })).toBeVisible();
  const restartButton = screen.getByRole("button", { name: "Start again" });
  act(() => {
    restartButton.click();
    dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(FOUR_REQUESTS);
  unmount();
  queryClient.clear();
});

test.each(["old renewal first", "new grant first"] as const)(
  "%s cannot put a scheduled grant into the restarted flow",
  async (order) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    const { backend, queryClient, uploader, view } = setupWorkflow();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const oldInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000509",
    };
    const newInput: RouterInputs["wizard"]["dryRun"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000510",
    };
    const oldReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "cccccccccccccccccccccccccccccccc",
      fields: [],
    };
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "dddddddddddddddddddddddddddddddd",
      fields: [],
    };
    const oldResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/old-before-restart" },
    };
    const newResult: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/new-after-restart" },
    };
    const oldGrant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: oldResult.result.downloadUrl,
      expiresAt: "2026-10-21T12:15:00Z",
    };
    const oldRenewed: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/late-old-renewal",
      expiresAt: "2026-10-21T12:28:00Z",
    };
    const newGrant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: newResult.result.downloadUrl,
      expiresAt: "2026-10-21T12:28:00Z",
    };
    const oldResponse = Promise.withResolvers<Response>();
    const newResponse = Promise.withResolvers<Response>();
    backend
      .mockResolvedValueOnce(Response.json(config))
      .mockResolvedValueOnce(Response.json(oldReview))
      .mockResolvedValueOnce(Response.json(oldResult))
      .mockResolvedValueOnce(Response.json(oldGrant))
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce(Response.json(newReview))
      .mockResolvedValueOnce(Response.json(newResult))
      .mockReturnValueOnce(newResponse.promise);
    const { unmount } = renderComponent(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    const oldUploader = uploader.current;
    expect.assert(oldUploader != null);
    act(() => {
      oldUploader.onUploadComplete(oldInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    const oldScrubButton = screen.getByRole("button", { name: "Scrub it" });
    act(() => {
      oldScrubButton.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(
        Date.parse("2026-10-21T12:13:00Z") - Date.now(),
      );
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(
      screen.getByRole("status", { name: "Checking download link" }),
    ).toBeVisible();
    expect(backend).toHaveBeenCalledTimes(FIVE_REQUESTS);
    const restartButton = screen.getByRole("button", { name: "Start again" });
    act(() => {
      restartButton.click();
    });
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    const newUploader = uploader.current;
    expect.assert(newUploader != null);
    act(() => {
      newUploader.onUploadComplete(newInput);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    const newScrubButton = screen.getByRole("button", { name: "Scrub it" });
    act(() => {
      newScrubButton.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(backend).toHaveBeenCalledTimes(EIGHT_REQUESTS);
    act(() => {
      if (order === "old renewal first") {
        oldResponse.resolve(Response.json(oldRenewed));
      } else {
        newResponse.resolve(Response.json(newGrant));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(
      screen.queryAllByRole("link", { name: "Download PDF" }),
    ).toHaveLength(order === "old renewal first" ? NO_LINKS : ONE_LINK);
    act(() => {
      if (order === "old renewal first") {
        newResponse.resolve(Response.json(newGrant));
      } else {
        oldResponse.resolve(Response.json(oldRenewed));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
      await vi.advanceTimersByTimeAsync(
        Date.parse("2026-10-21T12:15:00Z") - Date.now(),
      );
    });
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      newGrant.downloadUrl,
    );
    expect(backend).toHaveBeenCalledTimes(EIGHT_REQUESTS);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
    queryClient.clear();
  },
);
