import { TRPCError } from "@trpc/server";
import { HTTPError, TimeoutError } from "ky";
import { expect, test } from "vitest";

import {
  BAD_REQUEST_STATUS_CODE,
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  PAYLOAD_TOO_LARGE_STATUS_CODE,
  REQUEST_TIMEOUT_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  UNPROCESSABLE_ENTITY_STATUS_CODE,
  UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";

import {
  canonicalETagSchema,
  createUploadInputSchema,
  DRY_RUN_FAILURE_MESSAGE,
  mapWorkflowRequestFailure,
  scrubFileInputSchema,
  storageKeySchema,
  WORKFLOW_MAX_FILE_SIZE_BYTES,
} from "./wizard-router.mod.server";

const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const ALTERNATE_CANONICAL_ETAG = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ONE_BYTE = 1;
const BACKEND_REQUEST = new Request("https://backend.test/api/files/dry-run");

test.each([
  ["lower-case mixed hex", CANONICAL_ETAG, true],
  ["lower-case repeated hex", ALTERNATE_CANONICAL_ETAG, true],
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

test("storage key schema accepts a public upload key", () => {
  expect(storageKeySchema.safeParse(STORAGE_KEY).success).toBe(true);
});

test("storage key schema rejects a non-upload key", () => {
  expect(storageKeySchema.safeParse("source/not-public").success).toBe(false);
});

test("createUpload input schema rejects an invalid file name and oversized file", () => {
  const result = createUploadInputSchema.safeParse({
    fileName: "../report.pdf",
    fileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES + ONE_BYTE,
  });

  expect(result.success).toBe(false);
});

test("the scrub input schema rejects a missing ETag", () => {
  const result = scrubFileInputSchema.safeParse({ storageKey: STORAGE_KEY });

  expect(result.success).toBe(false);
});

test("mapWorkflowRequestFailure maps TimeoutError to TIMEOUT", async () => {
  const error = await mapWorkflowRequestFailure(
    new TimeoutError(BACKEND_REQUEST),
    DRY_RUN_FAILURE_MESSAGE,
  );

  expect(error).toBeInstanceOf(TRPCError);
  expect(error.code).toBe("TIMEOUT");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
});

test("mapWorkflowRequestFailure maps unknown causes to BAD_GATEWAY", async () => {
  const error = await mapWorkflowRequestFailure(
    new Error("network down"),
    DRY_RUN_FAILURE_MESSAGE,
  );

  expect(error).toBeInstanceOf(TRPCError);
  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
});

test("mapWorkflowRequestFailure maps an invalid HTTP body to BAD_GATEWAY", async () => {
  const response = new Response("not-json", { status: BAD_REQUEST_STATUS_CODE });
  const error = await mapWorkflowRequestFailure(
    new HTTPError(response, BACKEND_REQUEST, {
      method: "POST",
      url: BACKEND_REQUEST.url,
    }),
    DRY_RUN_FAILURE_MESSAGE,
  );

  expect(error).toBeInstanceOf(TRPCError);
  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
});

test.each([
  [BAD_REQUEST_STATUS_CODE, "BAD_REQUEST"],
  [NOT_FOUND_STATUS_CODE, "NOT_FOUND"],
  [REQUEST_TIMEOUT_STATUS_CODE, "TIMEOUT"],
  [CONFLICT_STATUS_CODE, "CONFLICT"],
  [PAYLOAD_TOO_LARGE_STATUS_CODE, "PAYLOAD_TOO_LARGE"],
  [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE, "UNSUPPORTED_MEDIA_TYPE"],
  [UNPROCESSABLE_ENTITY_STATUS_CODE, "UNPROCESSABLE_CONTENT"],
  [SERVICE_UNAVAILABLE_STATUS_CODE, "SERVICE_UNAVAILABLE"],
] as const)(
  "mapWorkflowRequestFailure maps backend HTTP %i to %s",
  async (status, code) => {
    const response = Response.json({ error: "safe backend error" }, { status });
    const error = await mapWorkflowRequestFailure(
      new HTTPError(response, BACKEND_REQUEST, {
        method: "POST",
        url: BACKEND_REQUEST.url,
      }),
      DRY_RUN_FAILURE_MESSAGE,
    );

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(DRY_RUN_FAILURE_MESSAGE);
    expect(error.message).not.toContain("safe backend error");
  },
);
