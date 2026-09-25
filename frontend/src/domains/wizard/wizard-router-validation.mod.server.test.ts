import { afterEach, expect, test, vi } from "vitest";
import * as z from "zod";

import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";

import { scrubFileInputSchema } from "./wizard-contracts.mod.server";
import { canonicalETagSchema } from "./wizard-identifiers.mod";
import {
  callerForRequest,
  requireTRPCError,
} from "./wizard-router.test-helper";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const ONE_BYTE = 1;

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([
  ["lower-case mixed hex", CANONICAL_ETAG, true],
  ["lower-case repeated hex", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true],
  ["empty", "", false],
  ["weak", `W/"${CANONICAL_ETAG}"`, false],
  ["quoted", `"${CANONICAL_ETAG}"`, false],
  ["leading quote", `"${CANONICAL_ETAG}`, false],
  ["trailing quote", `${CANONICAL_ETAG}"`, false],
  ["embedded quote", '0123456789abcde"0123456789abcdef', false],
  ["single quoted", `'${CANONICAL_ETAG}'`, false],
  ["line feed", "0123456789abcde\n0123456789abcdef", false],
  ["carriage return", "0123456789abcde\r0123456789abcdef", false],
  ["horizontal tab", "0123456789abcde\t0123456789abcdef", false],
  ["null", "0123456789abcde\u{0000}0123456789abcdef", false],
  ["too short", "0123456789abcdef0123456789abcde", false],
  ["too long", `${CANONICAL_ETAG}0`, false],
  ["upper case", CANONICAL_ETAG.toUpperCase(), false],
  ["non-hex", "0123456789abcdef0123456789abcdeg", false],
  ["multipart", `${CANONICAL_ETAG}-2`, false],
  ["leading space", ` ${CANONICAL_ETAG}`, false],
  ["trailing space", `${CANONICAL_ETAG} `, false],
  ["opaque", "revision-1", false],
])("canonical ETag schema handles %s", (_name, value, expectedSuccess) => {
  expect(canonicalETagSchema.safeParse(value).success).toBe(expectedSuccess);
});

test.each([
  ["path traversal", "../report.pdf"],
  ["leading white space", " report.pdf"],
  ["trailing white space", "report.pdf "],
])("createUpload rejects %s before fetch", async (_caseName, fileName) => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName,
    fileSizeBytes: ONE_BYTE,
  };
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("createUpload reports only the empty-name error for whitespace", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: " ",
    fileSizeBytes: ONE_BYTE,
  };
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).createUpload(input),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(error.cause).toBeInstanceOf(z.ZodError);
  if (error.cause instanceof z.ZodError) {
    expect(error.cause.issues).toEqual([
      expect.objectContaining({ message: "The file name must not be empty." }),
    ]);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("dryRun rejects an invalid storage key before fetch", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).dryRun({
      storageKey: "source/not-public",
    }),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the scrub input schema rejects a missing ETag", () => {
  const result = scrubFileInputSchema.safeParse({ storageKey: STORAGE_KEY });

  expect(result.success).toBe(false);
});

test("refreshDownloadGrant rejects an invalid ETag before fetch", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).refreshDownloadGrant({
      etag: `"${CANONICAL_ETAG}"`,
      storageKey: STORAGE_KEY,
    }),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("confirmDelete rejects an invalid storage key before fetch", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request, BACKEND_BASE_URL).confirmDelete({
      storageKey: "uploads/not-a-uuid",
    }),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(fetchMock).not.toHaveBeenCalled();
});
