import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { stringify } from "devalue";
import type { KyInstance } from "ky";
import ky from "ky";
import posthog from "posthog-js";
import { afterEach, expect, test, vi } from "vitest";

import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

import { initializeTRPCClient } from "./client-runtime.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

afterEach(() => {
  posthog.__loaded = false;
});

function setupClient(workflowHttpClient: KyInstance) {
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create(),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient,
  });
  const fetchMock = vi
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
  vi.stubGlobal("fetch", fetchMock);
  const client = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  return { client, fetchMock };
}

test("browser tRPC calls send the current PostHog IDs on every request", async () => {
  posthog.__loaded = true;
  vi.spyOn(posthog, "get_distinct_id")
    .mockReturnValueOnce("visitor-a")
    .mockReturnValue("visitor-b");
  vi.spyOn(posthog, "get_session_id")
    .mockReturnValueOnce("session-a")
    .mockReturnValue("session-b");
  const response: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 7_340_032,
  };
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: { beforeRequest: [() => Response.json(response)] },
    }),
  );

  await client.wizard.getWorkflowConfig.query();
  await client.wizard.getWorkflowConfig.query();

  const [[, firstOptions] = [], [, secondOptions] = []] = fetchMock.mock.calls;
  const firstHeaders = new Headers(firstOptions?.headers);
  const secondHeaders = new Headers(secondOptions?.headers);
  expect(firstHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-a");
  expect(firstHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-a");
  expect(secondHeaders.get("X-POSTHOG-DISTINCT-ID")).toBe("visitor-b");
  expect(secondHeaders.get("X-POSTHOG-SESSION-ID")).toBe("session-b");
});

test("tRPC sends no PostHog IDs for an uninitialized browser", async () => {
  posthog.__loaded = false;
  const response: RouterOutputs["wizard"]["getWorkflowConfig"] = {
    maxFileSizeBytes: 7_340_032,
  };
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: { beforeRequest: [() => Response.json(response)] },
    }),
  );

  await client.wizard.getWorkflowConfig.query();

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[, options] = []] = fetchMock.mock.calls;
  expect(options?.method).toBe("GET");
  expect(options?.body).toBeUndefined();
  const headers = new Headers(options?.headers);
  expect(headers.has("X-POSTHOG-DISTINCT-ID")).toBe(false);
  expect(headers.has("X-POSTHOG-SESSION-ID")).toBe(false);
});

test("browser dryRun sends only its typed JSON input by POST without private URL input", async () => {
  const input: RouterInputs["wizard"]["dryRun"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
  };
  const response: RouterOutputs["wizard"]["dryRun"] = {
    etag: "0123456789abcdef0123456789abcdef",
    fields: [],
  };
  const backendUrls: string[] = [];
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: {
        beforeRequest: [
          ({ request }) => {
            backendUrls.push(request.url);
            return Response.json(response);
          },
        ],
      },
    }),
  );

  await client.wizard.dryRun.mutate(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, options] = []] = fetchMock.mock.calls;
  expect(url).toBe("https://frontend.test/api/trpc/wizard.dryRun?batch=1");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(options?.body).toBe(JSON.stringify({ 0: stringify(input) }));
  expect(backendUrls).toEqual(["https://backend.test/api/files/dry-run"]);
});

test("browser scrubFile sends only its typed JSON input by POST without private URL input", async () => {
  const input: RouterInputs["wizard"]["scrubFile"] = {
    etag: "0123456789abcdef0123456789abcdef",
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
  };
  const response: RouterOutputs["wizard"]["scrubFile"] = {
    result: { downloadUrl: "https://downloads.test/sanitized.pdf" },
    status: "done",
  };
  const backendUrls: string[] = [];
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: {
        beforeRequest: [
          ({ request }) => {
            backendUrls.push(request.url);
            return Response.json(response);
          },
        ],
      },
    }),
  );

  await client.wizard.scrubFile.mutate(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, options] = []] = fetchMock.mock.calls;
  expect(url).toBe("https://frontend.test/api/trpc/wizard.scrubFile?batch=1");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(options?.body).toBe(JSON.stringify({ 0: stringify(input) }));
  expect(backendUrls).toEqual(["https://backend.test/api/files/scrub"]);
});

test("browser refreshDownloadGrant sends only its typed JSON input by POST without private URL input", async () => {
  const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    etag: "0123456789abcdef0123456789abcdef",
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
  };
  const response: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/sanitized.pdf",
    expiresAt: "2026-09-01T12:15:00Z",
  };
  const backendUrls: string[] = [];
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: {
        beforeRequest: [
          ({ request }) => {
            backendUrls.push(request.url);
            return Response.json(response);
          },
        ],
      },
    }),
  );

  await client.wizard.refreshDownloadGrant.mutate(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, options] = []] = fetchMock.mock.calls;
  expect(url).toBe(
    "https://frontend.test/api/trpc/wizard.refreshDownloadGrant?batch=1",
  );
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(options?.body).toBe(JSON.stringify({ 0: stringify(input) }));
  expect(backendUrls).toEqual([
    "https://backend.test/api/files/download-grant",
  ]);
});

test("browser confirmDelete sends only its typed JSON input by POST without private URL input", async () => {
  const input: RouterInputs["wizard"]["confirmDelete"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
  };
  const response: RouterOutputs["wizard"]["confirmDelete"] = {
    status: "deleted",
  };
  const backendUrls: string[] = [];
  const { client, fetchMock } = setupClient(
    ky.create({
      baseUrl: "https://backend.test/",
      hooks: {
        beforeRequest: [
          ({ request }) => {
            backendUrls.push(request.url);
            return Response.json(response);
          },
        ],
      },
    }),
  );

  await client.wizard.confirmDelete.mutate(input);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, options] = []] = fetchMock.mock.calls;
  expect(url).toBe(
    "https://frontend.test/api/trpc/wizard.confirmDelete?batch=1",
  );
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(options?.body).toBe(JSON.stringify({ 0: stringify(input) }));
  expect(backendUrls).toEqual(["https://backend.test/api/files/delete"]);
});
