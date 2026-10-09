import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { parse } from "devalue";
import { afterEach, expect, test, vi } from "vitest";

import { INTERNAL_SERVER_ERROR_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("production-mode HTTP errors omit stack traces without a production NODE_ENV", async () => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("NODE_ENV", "development");
  vi.resetModules();
  const { createTRPCRouter, createTRPCRequestContext, publicProcedure } =
    await import("./initializer.mod.server");
  const router = createTRPCRouter({
    fail: publicProcedure.query((): never => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The request failed.",
      });
    }),
  });
  const request = new Request("https://frontend.test/api/trpc/fail");

  const response = await fetchRequestHandler({
    createContext: () => createTRPCRequestContext(request),
    endpoint: "/api/trpc",
    req: request,
    router,
  });
  const body: unknown = await response.json();
  expect.assert(body != null && typeof body === "object" && "error" in body);
  expect.assert(typeof body.error === "string");
  const errorShape: unknown = parse(body.error);

  expect(response.status).toBe(INTERNAL_SERVER_ERROR_STATUS_CODE);
  expect(errorShape).toMatchObject({
    data: {
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: INTERNAL_SERVER_ERROR_STATUS_CODE,
    },
    message: "The request failed.",
  });
  expect(errorShape).not.toHaveProperty("data.stack");
});
