import type { inferRouterOutputs } from "@trpc/server";
import { afterEach, expect, test, vi } from "vitest";
import * as z from "zod";

import type { productsRouter } from "#/domains/products/products-router.mod.server";
import { workflowConfigResponseSchema } from "#/domains/wizard/wizard-contracts.mod.server";

import { appBindingsMiddleware, getAppBindings } from "./app-bindings.mod";

const { workerEnvironment } = vi.hoisted(() => ({
  workerEnvironment: {
    BACKEND: { fetch: vi.fn<typeof fetch>() },
    BACKEND_URL: "https://metadata-scrubber-backend.invalid",
  },
}));

// eslint-disable-next-line vitest/prefer-import-in-mock -- The mock tests invalid Worker env values outside the generated literal types and omits the unused Fetcher.connect method.
vi.mock("cloudflare:workers", () => ({ env: workerEnvironment }));

const BACKEND_REQUEST_COUNT = 2;
// eslint-disable-next-line no-undefined -- TanStack types the initial request context as undefined before middleware adds context.
const INITIAL_REQUEST_CONTEXT = undefined;

afterEach(() => {
  workerEnvironment.BACKEND_URL = "https://metadata-scrubber-backend.invalid";
  workerEnvironment.BACKEND.fetch.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("both backend clients use the service binding with its receiver and absolute request URLs", async () => {
  vi.stubEnv("DEV", false);
  const publicFetch = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("Public backend requests are not allowed"));
  vi.stubGlobal("fetch", publicFetch);
  const healthBody: inferRouterOutputs<typeof productsRouter>["getMessage"] = {
    status: "reachable",
  };
  const configBody: z.output<typeof workflowConfigResponseSchema> = {
    maxFileSizeBytes: 1024,
  };
  workerEnvironment.BACKEND.fetch
    .mockResolvedValueOnce(Response.json(healthBody))
    .mockResolvedValueOnce(Response.json(configBody));
  const request = new Request("https://frontend.test/");
  const handler = appBindingsMiddleware.options.server;
  expect.assert(handler != null);

  const next = vi.fn();
  next.mockImplementationOnce(async () => {
    const { httpClient, workflowHttpClient } = getAppBindings();
    const health = await httpClient
      .get("/api/health", { signal: request.signal })
      .json<inferRouterOutputs<typeof productsRouter>["getMessage"]>();
    const config = await workflowHttpClient
      .get("/api/files/config", { signal: request.signal })
      .json(workflowConfigResponseSchema);

    expect(health).toStrictEqual(healthBody);
    expect(config).toStrictEqual(configBody);
    return {
      context: INITIAL_REQUEST_CONTEXT,
      pathname: "/",
      request,
      response: new Response(),
    };
  });

  await handler({
    context: INITIAL_REQUEST_CONTEXT,
    handlerType: "router",
    next,
    pathname: "/",
    request,
  });

  expect(publicFetch).not.toHaveBeenCalled();
  expect(workerEnvironment.BACKEND.fetch.mock.contexts).toStrictEqual([
    workerEnvironment.BACKEND,
    workerEnvironment.BACKEND,
  ]);
  expect(workerEnvironment.BACKEND.fetch).toHaveBeenCalledTimes(
    BACKEND_REQUEST_COUNT,
  );
  const [[healthRequest] = [], [configRequest] = []] =
    workerEnvironment.BACKEND.fetch.mock.calls;
  expect(healthRequest).toMatchObject({
    method: "GET",
    url: "https://metadata-scrubber-backend.invalid/api/health",
  });
  expect(configRequest).toMatchObject({
    method: "GET",
    url: "https://metadata-scrubber-backend.invalid/api/files/config",
  });
});

test("both backend clients use global fetch with BACKEND_URL in local development", async () => {
  vi.stubEnv("DEV", true);
  workerEnvironment.BACKEND_URL = "http://localhost:8080";
  workerEnvironment.BACKEND.fetch.mockRejectedValue(
    new Error("Local backend requests must not use the service binding"),
  );
  const healthBody: inferRouterOutputs<typeof productsRouter>["getMessage"] = {
    status: "reachable",
  };
  const configBody: z.output<typeof workflowConfigResponseSchema> = {
    maxFileSizeBytes: 1024,
  };
  const publicFetch = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(healthBody))
    .mockResolvedValueOnce(Response.json(configBody));
  vi.stubGlobal("fetch", publicFetch);
  const request = new Request("https://frontend.test/");
  const handler = appBindingsMiddleware.options.server;
  expect.assert(handler != null);

  const next = vi.fn();
  next.mockImplementationOnce(async () => {
    const { httpClient, workflowHttpClient } = getAppBindings();
    const health = await httpClient
      .get("/api/health", { signal: request.signal })
      .json<inferRouterOutputs<typeof productsRouter>["getMessage"]>();
    const config = await workflowHttpClient
      .get("/api/files/config", { signal: request.signal })
      .json(workflowConfigResponseSchema);

    expect(health).toStrictEqual(healthBody);
    expect(config).toStrictEqual(configBody);
    return {
      context: INITIAL_REQUEST_CONTEXT,
      pathname: "/",
      request,
      response: new Response(),
    };
  });

  await handler({
    context: INITIAL_REQUEST_CONTEXT,
    handlerType: "router",
    next,
    pathname: "/",
    request,
  });

  expect(workerEnvironment.BACKEND.fetch).not.toHaveBeenCalled();
  expect(publicFetch.mock.contexts).toStrictEqual([globalThis, globalThis]);
  expect(publicFetch).toHaveBeenCalledTimes(BACKEND_REQUEST_COUNT);
  const [[healthRequest] = [], [configRequest] = []] = publicFetch.mock.calls;
  expect(healthRequest).toMatchObject({
    method: "GET",
    url: "http://localhost:8080/api/health",
  });
  expect(configRequest).toMatchObject({
    method: "GET",
    url: "http://localhost:8080/api/files/config",
  });
});

test("an invalid Worker BACKEND_URL rejects before downstream code runs", async () => {
  vi.stubEnv("BACKEND_URL", "https://valid-but-unused.invalid");
  workerEnvironment.BACKEND_URL = "not-an-absolute-url";
  const next = vi.fn();
  const request = new Request("https://frontend.test/");
  const handler = appBindingsMiddleware.options.server;
  expect.assert(handler != null);

  await expect(
    handler({
      context: INITIAL_REQUEST_CONTEXT,
      handlerType: "router",
      next,
      pathname: "/",
      request,
    }),
  ).rejects.toBeInstanceOf(z.ZodError);
  expect(next).not.toHaveBeenCalled();
});
