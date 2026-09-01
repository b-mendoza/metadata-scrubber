import { TRPCError } from "@trpc/server";
import ky from "ky";
import { afterEach, expect, test, vi } from "vitest";

import { environmentSchema } from "#/shared/config/env/environment.mod.server";
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";
import {
  createCallerFactory,
  createTRPCRequestContext,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

import type { CreateUploadInput } from "./wizard-router.mod.server";
import {
  canonicalETagSchema,
  CREATE_UPLOAD_FAILURE_MESSAGE,
  scrubFileInputSchema,
  storageKeySchema,
  wizardRouter,
  WORKFLOW_CONFIG_FAILURE_MESSAGE,
  WORKFLOW_MAX_FILE_SIZE_BYTES,
} from "./wizard-router.mod.server";

vi.mock(
  import("#/shared/middlewares/application-bindings/application-bindings.mod"),
  () => ({
    getApplicationBindings: vi.fn(),
  }),
);

const BACKEND_BASE_URL = new URL("https://backend.test/");
const FRONTEND_URL = "https://frontend.test/";
const STORAGE_KEY = "uploads/00000000-0000-4000-8000-000000000001";
const CANONICAL_ETAG = "0123456789abcdef0123456789abcdef";
const ALTERNATE_CANONICAL_ETAG = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ONE_BYTE = 1;

const testEnvironment = environmentSchema.parse({
  BACKEND_URL: BACKEND_BASE_URL.href,
});
const createWizardCaller = createCallerFactory(wizardRouter);

type WizardCaller = ReturnType<typeof createWizardCaller>;

const callerForRequest = (request: Request): WizardCaller => {
  vi.mocked(getApplicationBindings).mockReturnValue({
    env: testEnvironment,
    httpClient: ky.create({ baseUrl: BACKEND_BASE_URL }),
    workflowHttpClient: createWorkflowHttpClient(BACKEND_BASE_URL),
  });
  return createWizardCaller(createTRPCRequestContext(request), {
    signal: request.signal,
  });
};

const requireTRPCError = async (
  operation: Promise<unknown>,
): Promise<TRPCError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    if (error instanceof TRPCError) {
      return error;
    }
  }
  expect.fail("the workflow procedure must reject with a TRPCError");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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

test("createUpload rejects invalid input before fetch", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request).createUpload({
      fileName: "../report.pdf",
      fileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES + ONE_BYTE,
    }),
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the scrub input schema rejects a missing ETag", () => {
  const result = scrubFileInputSchema.safeParse({ storageKey: STORAGE_KEY });

  expect(result.success).toBe(false);
});

test("getWorkflowConfig rejects a wrong backend-owned byte limit", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      maxFileSizeBytes: WORKFLOW_MAX_FILE_SIZE_BYTES - ONE_BYTE,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request).getWorkflowConfig(),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(WORKFLOW_CONFIG_FAILURE_MESSAGE);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("createUpload rejects an invalid backend upload URL", async () => {
  const input: CreateUploadInput = {
    fileName: "report.pdf",
    fileSizeBytes: ONE_BYTE,
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ storageKey: STORAGE_KEY, uploadUrl: "not-a-url" }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request(FRONTEND_URL);

  const error = await requireTRPCError(
    callerForRequest(request).createUpload(input),
  );

  expect(error.code).toBe("BAD_GATEWAY");
  expect(error.message).toBe(CREATE_UPLOAD_FAILURE_MESSAGE);
});
