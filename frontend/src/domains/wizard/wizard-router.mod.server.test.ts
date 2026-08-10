// oxlint-disable-next-line @eslint-community/eslint-comments/disable-enable-pair -- The max-lines rule applies to the full approved test file.
/* oxlint-disable max-lines */
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BAD_REQUEST_STATUS_CODE,
  CONFLICT_STATUS_CODE,
  CREATED_STATUS_CODE,
  INTERNAL_SERVER_ERROR_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  OK_STATUS_CODE,
  PAYLOAD_TOO_LARGE_STATUS_CODE,
  REQUEST_TIMEOUT_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  UNPROCESSABLE_ENTITY_STATUS_CODE,
  UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";
import { caller } from "#/shared/libs/trpc/routers/routers.mod.server";
import * as applicationBindingsModule from "#/shared/middlewares/application-bindings/application-bindings.mod";

vi.mock(
  "#/shared/middlewares/application-bindings/application-bindings.mod",
  async (importOriginal) => {
    const original = await importOriginal<typeof applicationBindingsModule>();

    return {
      ...original,
      getApplicationBindings: vi.fn(),
    };
  },
);

const BACKEND_URL = "https://backend.example.test/base/";
const CONFLICTING_BACKEND_URL = "https://wrong.example.test/";
const FRONTEND_URL = "https://frontend.example.test/api/trpc";
const STORAGE_KEY = "uploads/123e4567-e89b-42d3-a456-426614174000";
const ETAG = 'a/b+=%"..';
const MAX_FILE_SIZE_BYTES = 10_000_000;
const MAX_FILENAME_BYTES = 255;
const MAX_PREVIEW_BYTES = 256;
const MAX_FIELDS = 128;
const UTF8_BYTES_PER_E_ACUTE = 2;
const PDF_EXTENSION_BYTES = 4;
const ZERO_BYTES = 0;
const FIRST_FIELD_INDEX = 0;
const ONE_BYTE = 1;
const SAMPLE_FILE_SIZE_BYTES = 1_024;
const ORIGINAL_BYTE_SIZE = 12;
const TOO_LARGE_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES + ONE_BYTE;
const TOO_MANY_FIELDS = MAX_FIELDS + ONE_BYTE;
const UNKNOWN_STATUS_CODE = 599;
const GENERIC_GATEWAY_MESSAGE =
  "The file service could not complete the request.";

interface WizardTestCaller {
  createUpload: (input: unknown) => Promise<unknown>;
  dryRun: (input: unknown) => Promise<unknown>;
  scrubFile: (input: unknown) => Promise<unknown>;
}

type ProcedureName = keyof WizardTestCaller;

interface DryRunField {
  action: "remove" | "replace";
  label: string;
  name: string;
  originalByteSize: number;
  preview: string;
}

const createRequest = () => new Request(FRONTEND_URL);

const requireProcedure = (
  router: object,
  procedureName: ProcedureName,
): ((input: unknown) => Promise<unknown>) => {
  const procedure: unknown = Reflect.get(router, procedureName);

  if (typeof procedure !== "function") {
    throw new TypeError(`Missing wizard procedure: ${procedureName}`);
  }

  return async (input) => {
    const result: unknown = Reflect.apply(procedure, router, [input]);

    if (!(result instanceof Promise)) {
      throw new TypeError(
        `Wizard procedure did not return a Promise: ${procedureName}`,
      );
    }

    const resolvedResult: unknown = await result;

    return resolvedResult;
  };
};

const getWizardCaller = (request: Request): WizardTestCaller => {
  const rootCaller = caller(request);
  const wizard: unknown = Reflect.get(rootCaller, "wizard");

  if (
    (typeof wizard !== "object" && typeof wizard !== "function") ||
    wizard === null
  ) {
    throw new TypeError("Missing wizard router");
  }

  return {
    createUpload: requireProcedure(wizard, "createUpload"),
    dryRun: requireProcedure(wizard, "dryRun"),
    scrubFile: requireProcedure(wizard, "scrubFile"),
  };
};

const invokeProcedure = async (
  wizard: WizardTestCaller,
  procedureName: ProcedureName,
  input: unknown,
) => wizard[procedureName](input);

const jsonResponse = (body: unknown, status = OK_STATUS_CODE) =>
  new Response(JSON.stringify(body), { status });

const createField = (overrides: Partial<DryRunField> = {}): DryRunField => ({
  action: "remove",
  label: "Author",
  name: "Author",
  originalByteSize: ORIGINAL_BYTE_SIZE,
  preview: "Jane Doe",
  ...overrides,
});

const captureTRPCError = async (
  operation: Promise<unknown>,
): Promise<TRPCError> => {
  try {
    await operation;
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected the procedure to reject");
};

const expectGatewayError = async (operation: Promise<unknown>) => {
  const error = await captureTRPCError(operation);

  expect(error).toMatchObject({
    code: "BAD_GATEWAY",
    message: GENERIC_GATEWAY_MESSAGE,
  });

  return error;
};

beforeEach(() => {
  vi.mocked(applicationBindingsModule.getApplicationBindings).mockReturnValue({
    env: {
      BACKEND_URL,
      DATABASE_URL: undefined,
    },
  });
});

describe("server request contracts", () => {
  test("createUpload sends the validated JSON request", async () => {
    const request = createRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        storageKey: STORAGE_KEY,
        uploadUrl: "https://uploads.example.test/source.pdf",
      }),
    );

    await expect(
      getWizardCaller(request).createUpload({
        fileName: "résumé.pdf",
        fileSizeBytes: MAX_FILE_SIZE_BYTES,
      }),
    ).resolves.toEqual({
      storageKey: STORAGE_KEY,
      uploadUrl: "https://uploads.example.test/source.pdf",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/uploads", BACKEND_URL),
      expect.objectContaining({
        body: '{"fileName":"résumé.pdf","fileSizeBytes":10000000}',
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: request.signal,
      }),
    );
  });

  test("dryRun sends the validated storage key", async () => {
    const request = createRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        etag: ETAG,
        fields: [],
      }),
    );

    await expect(
      getWizardCaller(request).dryRun({ storageKey: STORAGE_KEY }),
    ).resolves.toEqual({
      etag: ETAG,
      fields: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/files/dry-run", BACKEND_URL),
      expect.objectContaining({
        body: `{"storageKey":"${STORAGE_KEY}"}`,
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: request.signal,
      }),
    );
  });

  test("scrubFile forwards the exact ETag", async () => {
    const request = createRequest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        result: {
          downloadUrl: "https://downloads.example.test/clean.pdf",
        },
        status: "done",
      }),
    );

    await expect(
      getWizardCaller(request).scrubFile({
        etag: ETAG,
        storageKey: STORAGE_KEY,
      }),
    ).resolves.toEqual({
      result: {
        downloadUrl: "https://downloads.example.test/clean.pdf",
      },
      status: "done",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/files/scrub", BACKEND_URL),
      expect.objectContaining({
        body: `{"storageKey":"${STORAGE_KEY}","etag":"a/b+=%\\".."}`,
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: request.signal,
      }),
    );
  });

  test("the proxy uses the request binding instead of process.env", async () => {
    vi.stubEnv("BACKEND_URL", CONFLICTING_BACKEND_URL);

    try {
      const request = createRequest();
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({
          storageKey: STORAGE_KEY,
          uploadUrl: "https://uploads.example.test/source.pdf",
        }),
      );

      await getWizardCaller(request).createUpload({
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        new URL("/api/uploads", BACKEND_URL),
        expect.any(Object),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("procedure input validation", () => {
  test("createUpload accepts valid boundary values without changing them", async () => {
    const exactLengthFileName = `${"a".repeat(MAX_FILENAME_BYTES - PDF_EXTENSION_BYTES)}.pdf`;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          storageKey: STORAGE_KEY,
          uploadUrl: "https://uploads.example.test/first",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          storageKey: STORAGE_KEY,
          uploadUrl: "https://uploads.example.test/minimum",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          storageKey: STORAGE_KEY,
          uploadUrl: "https://uploads.example.test/maximum",
        }),
      );
    const wizard = getWizardCaller(createRequest());

    await wizard.createUpload({
      fileName: "résumé.txt",
      fileSizeBytes: ONE_BYTE,
    });
    await wizard.createUpload({
      fileName: exactLengthFileName,
      fileSizeBytes: MAX_FILE_SIZE_BYTES,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      ONE_BYTE,
      expect.any(URL),
      expect.objectContaining({
        body: '{"fileName":"résumé.txt","fileSizeBytes":1}',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      UTF8_BYTES_PER_E_ACUTE,
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          fileName: exactLengthFileName,
          fileSizeBytes: MAX_FILE_SIZE_BYTES,
        }),
      }),
    );
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
    ["forward path separator", "folder/file.pdf"],
    ["backward path separator", "folder\\file.pdf"],
    ["control character", "file .pdf"],
    ["more than 255 ASCII bytes", "a".repeat(MAX_FILENAME_BYTES + ONE_BYTE)],
    [
      "more than 255 multibyte bytes",
      "é".repeat(MAX_FILENAME_BYTES / UTF8_BYTES_PER_E_ACUTE + ONE_BYTE),
    ],
  ])("createUpload rejects a %s filename before fetch", async (_, fileName) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      getWizardCaller(createRequest()).createUpload({
        fileName,
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["zero", ZERO_BYTES],
    ["negative", -ONE_BYTE],
    ["above the maximum", TOO_LARGE_FILE_SIZE_BYTES],
    ["fractional", ONE_BYTE / UTF8_BYTES_PER_E_ACUTE],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + ONE_BYTE],
  ])(
    "createUpload rejects a %s size before fetch",
    async (_, fileSizeBytes) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await expect(
        getWizardCaller(createRequest()).createUpload({
          fileName: "document.pdf",
          fileSizeBytes,
        }),
      ).rejects.toBeInstanceOf(TRPCError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["missing prefix", "123e4567-e89b-42d3-a456-426614174000"],
    ["uppercase UUID", "uploads/123E4567-E89B-42D3-A456-426614174000"],
    ["non-v4 UUID", "uploads/123e4567-e89b-32d3-a456-426614174000"],
    ["invalid variant", "uploads/123e4567-e89b-42d3-7456-426614174000"],
    ["extra suffix", `${STORAGE_KEY}/extra`],
  ])(
    "dryRun and scrubFile reject a %s storage key before fetch",
    async (_, storageKey) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const wizard = getWizardCaller(createRequest());

      await expect(wizard.dryRun({ storageKey })).rejects.toBeInstanceOf(
        TRPCError,
      );
      await expect(
        wizard.scrubFile({ etag: ETAG, storageKey }),
      ).rejects.toBeInstanceOf(TRPCError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["empty", ""],
    ["leading whitespace", " revision"],
    ["trailing whitespace", "revision "],
    ["control character", "revision\n"],
    ["weak prefix", "W/revision"],
    ["matching quotes", '"revision"'],
  ])("scrubFile rejects a %s ETag before fetch", async (_, etag) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      getWizardCaller(createRequest()).scrubFile({
        etag,
        storageKey: STORAGE_KEY,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const unknownInputCases = [
    [
      "createUpload",
      {
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
        pdfBytes: "not-allowed",
      },
    ],
    [
      "dryRun",
      {
        file: "not-allowed",
        storageKey: STORAGE_KEY,
      },
    ],
    [
      "scrubFile",
      {
        etag: ETAG,
        file: "not-allowed",
        storageKey: STORAGE_KEY,
      },
    ],
  ] satisfies ReadonlyArray<readonly [ProcedureName, unknown]>;

  test.each(unknownInputCases)(
    "%s rejects unknown input keys before fetch",
    async (procedureName, input) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");

      await expect(
        invokeProcedure(getWizardCaller(createRequest()), procedureName, input),
      ).rejects.toBeInstanceOf(TRPCError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("successful backend response validation", () => {
  test.each([
    "http://uploads.example.test/source",
    "https://uploads.example.test/source",
  ])(
    "createUpload accepts the strict success contract for %s",
    async (uploadUrl) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ storageKey: STORAGE_KEY, uploadUrl }),
      );

      await expect(
        getWizardCaller(createRequest()).createUpload({
          fileName: "document.pdf",
          fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
        }),
      ).resolves.toEqual({ storageKey: STORAGE_KEY, uploadUrl });
    },
  );

  test.each([
    ["a missing field", { storageKey: STORAGE_KEY }],
    [
      "an unknown field",
      {
        storageKey: STORAGE_KEY,
        trace: "internal",
        uploadUrl: "https://uploads.example.test/source",
      },
    ],
    [
      "an invalid storage key",
      {
        storageKey: "uploads/not-a-uuid",
        uploadUrl: "https://uploads.example.test/source",
      },
    ],
    [
      "a relative URL",
      {
        storageKey: STORAGE_KEY,
        uploadUrl: "/source",
      },
    ],
    [
      "an unsupported URL scheme",
      {
        storageKey: STORAGE_KEY,
        uploadUrl: "ftp://uploads.example.test/source",
      },
    ],
  ])("createUpload rejects %s", async (_, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    await expectGatewayError(
      getWizardCaller(createRequest()).createUpload({
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      }),
    );
  });

  test("dryRun accepts valid bounded fields and returns no digest", async () => {
    const exactPreview = "é".repeat(MAX_PREVIEW_BYTES / UTF8_BYTES_PER_E_ACUTE);
    const fields = Array.from({ length: MAX_FIELDS }, (_, index) =>
      createField({
        action: index === FIRST_FIELD_INDEX ? "replace" : "remove",
        originalByteSize:
          index === FIRST_FIELD_INDEX ? ZERO_BYTES : ORIGINAL_BYTE_SIZE,
        preview: index === FIRST_FIELD_INDEX ? exactPreview : "value",
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ etag: ETAG, fields }),
    );

    const result = await getWizardCaller(createRequest()).dryRun({
      storageKey: STORAGE_KEY,
    });

    expect(result).toEqual({ etag: ETAG, fields });
    expect(fields).toHaveLength(MAX_FIELDS);
    expect(fields[FIRST_FIELD_INDEX]).not.toHaveProperty("digest");
  });

  test.each([
    ["a missing ETag", { fields: [] }],
    ["a missing field list", { etag: ETAG }],
    ["an unknown top-level key", { etag: ETAG, fields: [], trace: "internal" }],
    ["an empty ETag", { etag: "", fields: [] }],
    ["a leading-space ETag", { etag: " revision", fields: [] }],
    ["a trailing-space ETag", { etag: "revision ", fields: [] }],
    ["a control-character ETag", { etag: "revision\n", fields: [] }],
    ["a weak ETag", { etag: "W/revision", fields: [] }],
    ["a quoted ETag", { etag: '"revision"', fields: [] }],
  ])("dryRun rejects %s", async (_, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    await expectGatewayError(
      getWizardCaller(createRequest()).dryRun({ storageKey: STORAGE_KEY }),
    );
  });

  test.each([
    ["a missing field property", { etag: ETAG, fields: [{ name: "Author" }] }],
    [
      "an unknown field property",
      { etag: ETAG, fields: [{ ...createField(), digest: "private" }] },
    ],
    ["an empty name", { etag: ETAG, fields: [createField({ name: "" })] }],
    ["an empty label", { etag: ETAG, fields: [createField({ label: "" })] }],
    [
      "an oversized ASCII preview",
      {
        etag: ETAG,
        fields: [
          createField({ preview: "a".repeat(MAX_PREVIEW_BYTES + ONE_BYTE) }),
        ],
      },
    ],
    [
      "an oversized multibyte preview",
      {
        etag: ETAG,
        fields: [
          createField({
            preview: "é".repeat(
              MAX_PREVIEW_BYTES / UTF8_BYTES_PER_E_ACUTE + ONE_BYTE,
            ),
          }),
        ],
      },
    ],
    [
      "a negative original byte size",
      { etag: ETAG, fields: [createField({ originalByteSize: -ONE_BYTE })] },
    ],
    [
      "a fractional original byte size",
      {
        etag: ETAG,
        fields: [
          createField({
            originalByteSize: ONE_BYTE / UTF8_BYTES_PER_E_ACUTE,
          }),
        ],
      },
    ],
    [
      "an unsafe original byte size",
      {
        etag: ETAG,
        fields: [
          createField({ originalByteSize: Number.MAX_SAFE_INTEGER + ONE_BYTE }),
        ],
      },
    ],
    [
      "an unsupported action",
      {
        etag: ETAG,
        fields: [{ ...createField(), action: "keep" }],
      },
    ],
    [
      "too many fields",
      {
        etag: ETAG,
        fields: Array.from({ length: TOO_MANY_FIELDS }, () => createField()),
      },
    ],
  ])("dryRun rejects %s", async (_, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    await expectGatewayError(
      getWizardCaller(createRequest()).dryRun({ storageKey: STORAGE_KEY }),
    );
  });

  test.each([
    "http://downloads.example.test/clean.pdf",
    "https://downloads.example.test/clean.pdf",
  ])(
    "scrubFile accepts the strict done response for %s",
    async (downloadUrl) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ result: { downloadUrl }, status: "done" }),
      );

      await expect(
        getWizardCaller(createRequest()).scrubFile({
          etag: ETAG,
          storageKey: STORAGE_KEY,
        }),
      ).resolves.toEqual({ result: { downloadUrl }, status: "done" });
    },
  );

  test.each([
    ["a missing result", { status: "done" }],
    [
      "an unknown envelope field",
      {
        result: { downloadUrl: "https://downloads.example.test/clean.pdf" },
        status: "done",
        trace: "internal",
      },
    ],
    [
      "an unknown result field",
      {
        result: {
          downloadUrl: "https://downloads.example.test/clean.pdf",
          trace: "internal",
        },
        status: "done",
      },
    ],
    [
      "an unexpected status",
      {
        result: { downloadUrl: "https://downloads.example.test/clean.pdf" },
        status: "pending",
      },
    ],
    [
      "a relative download URL",
      { result: { downloadUrl: "/clean.pdf" }, status: "done" },
    ],
    [
      "an unsupported download URL scheme",
      {
        result: { downloadUrl: "ftp://downloads.example.test/clean.pdf" },
        status: "done",
      },
    ],
  ])("scrubFile rejects %s", async (_, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));

    await expectGatewayError(
      getWizardCaller(createRequest()).scrubFile({
        etag: ETAG,
        storageKey: STORAGE_KEY,
      }),
    );
  });
});

describe("expected backend error translation", () => {
  const approvedErrors = [
    {
      code: "BAD_REQUEST",
      input: {
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      },
      message: "The upload request is invalid.",
      procedure: "createUpload",
      status: BAD_REQUEST_STATUS_CODE,
    },
    {
      code: "TIMEOUT",
      input: {
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      },
      message: "The upload request timed out.",
      procedure: "createUpload",
      status: REQUEST_TIMEOUT_STATUS_CODE,
    },
    {
      code: "BAD_REQUEST",
      input: { storageKey: STORAGE_KEY },
      message: "The PDF could not be inspected.",
      procedure: "dryRun",
      status: BAD_REQUEST_STATUS_CODE,
    },
    {
      code: "NOT_FOUND",
      input: { storageKey: STORAGE_KEY },
      message: "The uploaded file was not found.",
      procedure: "dryRun",
      status: NOT_FOUND_STATUS_CODE,
    },
    {
      code: "TIMEOUT",
      input: { storageKey: STORAGE_KEY },
      message: "The PDF review timed out.",
      procedure: "dryRun",
      status: REQUEST_TIMEOUT_STATUS_CODE,
    },
    {
      code: "PAYLOAD_TOO_LARGE",
      input: { storageKey: STORAGE_KEY },
      message: "The PDF is larger than 10 MB.",
      procedure: "dryRun",
      status: PAYLOAD_TOO_LARGE_STATUS_CODE,
    },
    {
      code: "UNSUPPORTED_MEDIA_TYPE",
      input: { storageKey: STORAGE_KEY },
      message: "The uploaded file is not a PDF.",
      procedure: "dryRun",
      status: UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
    },
    {
      code: "UNPROCESSABLE_CONTENT",
      input: { storageKey: STORAGE_KEY },
      message: "Signed PDF files are not supported.",
      procedure: "dryRun",
      status: UNPROCESSABLE_ENTITY_STATUS_CODE,
    },
    {
      code: "SERVICE_UNAVAILABLE",
      input: { storageKey: STORAGE_KEY },
      message: "PDF processing is temporarily unavailable. Try again.",
      procedure: "dryRun",
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    },
    {
      code: "BAD_REQUEST",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The scrub request is invalid.",
      procedure: "scrubFile",
      status: BAD_REQUEST_STATUS_CODE,
    },
    {
      code: "NOT_FOUND",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The uploaded file was not found.",
      procedure: "scrubFile",
      status: NOT_FOUND_STATUS_CODE,
    },
    {
      code: "TIMEOUT",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The PDF scrub timed out.",
      procedure: "scrubFile",
      status: REQUEST_TIMEOUT_STATUS_CODE,
    },
    {
      code: "CONFLICT",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The file changed after review. Review it again.",
      procedure: "scrubFile",
      status: CONFLICT_STATUS_CODE,
    },
    {
      code: "PAYLOAD_TOO_LARGE",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The PDF is larger than 10 MB.",
      procedure: "scrubFile",
      status: PAYLOAD_TOO_LARGE_STATUS_CODE,
    },
    {
      code: "UNSUPPORTED_MEDIA_TYPE",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "The uploaded file is not a PDF.",
      procedure: "scrubFile",
      status: UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
    },
    {
      code: "UNPROCESSABLE_CONTENT",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "Signed PDF files are not supported.",
      procedure: "scrubFile",
      status: UNPROCESSABLE_ENTITY_STATUS_CODE,
    },
    {
      code: "SERVICE_UNAVAILABLE",
      input: { etag: ETAG, storageKey: STORAGE_KEY },
      message: "PDF processing is temporarily unavailable. Try again.",
      procedure: "scrubFile",
      status: SERVICE_UNAVAILABLE_STATUS_CODE,
    },
  ] as const satisfies ReadonlyArray<{
    code: string;
    input: unknown;
    message: string;
    procedure: ProcedureName;
    status: number;
  }>;

  test.each(approvedErrors)(
    "$procedure maps HTTP $status to $code with a frontend-owned message",
    async ({ code, input, message, procedure, status }) => {
      const backendMarker = `private-${procedure}-${status}`;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ error: backendMarker }, status),
      );

      const error = await captureTRPCError(
        invokeProcedure(getWizardCaller(createRequest()), procedure, input),
      );

      expect(error).toMatchObject({ code, message });
      expect(error.message).not.toContain(backendMarker);
    },
  );

  test.each([
    {
      input: {
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      },
      procedure: "createUpload",
      status: NOT_FOUND_STATUS_CODE,
    },
    {
      input: { storageKey: STORAGE_KEY },
      procedure: "dryRun",
      status: CONFLICT_STATUS_CODE,
    },
    {
      input: {
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      },
      procedure: "createUpload",
      status: UNPROCESSABLE_ENTITY_STATUS_CODE,
    },
  ] satisfies ReadonlyArray<{
    input: unknown;
    procedure: ProcedureName;
    status: number;
  }>)(
    "$procedure treats unlisted HTTP $status as a gateway failure",
    async ({ input, procedure, status }) => {
      const backendMarker = `unlisted-${procedure}-${status}`;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ error: backendMarker }, status),
      );

      const error = await expectGatewayError(
        invokeProcedure(getWizardCaller(createRequest()), procedure, input),
      );

      expect(error.message).not.toContain(backendMarker);
    },
  );
});

describe("upstream contract and transport failures", () => {
  test.each([
    {
      createFetch: async () =>
        Promise.reject(new Error("transport-private-marker")),
      marker: "transport-private-marker",
      name: "a rejected fetch",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          new Response("unreadable-private-marker {", {
            status: OK_STATUS_CODE,
          }),
        ),
      marker: "unreadable-private-marker",
      name: "an unreadable JSON body",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          new Response('{"storageKey":"malformed-private-marker"', {
            status: OK_STATUS_CODE,
          }),
        ),
      marker: "malformed-private-marker",
      name: "malformed success JSON",
    },
    {
      createFetch: async () =>
        Promise.resolve(jsonResponse({}, BAD_REQUEST_STATUS_CODE)),
      marker: "missing-error-private-marker",
      name: "an error body with a missing field",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            { error: { secret: "wrong-type-private-marker" } },
            BAD_REQUEST_STATUS_CODE,
          ),
        ),
      marker: "wrong-type-private-marker",
      name: "an error body with a wrong field type",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            {
              error: "extra-field-private-marker",
              trace: "extra-field-private-marker",
            },
            BAD_REQUEST_STATUS_CODE,
          ),
        ),
      marker: "extra-field-private-marker",
      name: "an error body with an extra field",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            { error: "internal-private-marker" },
            INTERNAL_SERVER_ERROR_STATUS_CODE,
          ),
        ),
      marker: "internal-private-marker",
      name: "HTTP 500",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            { error: "unknown-status-private-marker" },
            UNKNOWN_STATUS_CODE,
          ),
        ),
      marker: "unknown-status-private-marker",
      name: "an unknown HTTP status",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            { error: "unlisted-private-marker" },
            NOT_FOUND_STATUS_CODE,
          ),
        ),
      marker: "unlisted-private-marker",
      name: "an unlisted endpoint and status pair",
    },
    {
      createFetch: async () =>
        Promise.resolve(
          jsonResponse(
            {
              storageKey: STORAGE_KEY,
              uploadUrl: "https://uploads.example.test/unexpected",
            },
            CREATED_STATUS_CODE,
          ),
        ),
      marker: "unexpected-success-private-marker",
      name: "an unexpected success status",
    },
  ])(
    "createUpload maps $name to the generic gateway error",
    async ({ createFetch, marker }) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(createFetch);

      const error = await expectGatewayError(
        getWizardCaller(createRequest()).createUpload({
          fileName: "document.pdf",
          fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
        }),
      );

      expect(error.message).not.toContain(marker);
    },
  );

  test("no gateway error discloses backend or internal data", async () => {
    const sentinels = {
      backendError: "backend-error-private",
      backendURL: "https://backend-private.example.test/",
      cause: "cause-private",
      header: "header-private",
      rawBody: "raw-body-private",
      signedURL: "https://signed-private.example.test/download",
      stack: "stack-private",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: sentinels.backendError,
          headers: sentinels.header,
          rawBody: sentinels.rawBody,
          signedUrl: sentinels.signedURL,
          stack: sentinels.stack,
          upstream: sentinels.backendURL,
        },
        BAD_REQUEST_STATUS_CODE,
      ),
    );

    const error = await expectGatewayError(
      getWizardCaller(createRequest()).createUpload({
        fileName: "document.pdf",
        fileSizeBytes: SAMPLE_FILE_SIZE_BYTES,
      }),
    );

    for (const sentinel of Object.values(sentinels)) {
      expect(error.message).not.toContain(sentinel);
    }
  });
});

describe("duplicate scrub success", () => {
  test("a repeated scrub returns each fresh download URL", async () => {
    const firstDownloadURL = "https://downloads.example.test/first.pdf";
    const secondDownloadURL = "https://downloads.example.test/second.pdf";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          result: { downloadUrl: firstDownloadURL },
          status: "done",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: { downloadUrl: secondDownloadURL },
          status: "done",
        }),
      );
    const wizard = getWizardCaller(createRequest());
    const input = { etag: ETAG, storageKey: STORAGE_KEY };

    await expect(wizard.scrubFile(input)).resolves.toEqual({
      result: { downloadUrl: firstDownloadURL },
      status: "done",
    });
    await expect(wizard.scrubFile(input)).resolves.toEqual({
      result: { downloadUrl: secondDownloadURL },
      status: "done",
    });

    const expectedRequest: unknown = expect.objectContaining({
      body: `{"storageKey":"${STORAGE_KEY}","etag":"a/b+=%\\".."}`,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      ONE_BYTE,
      new URL("/api/files/scrub", BACKEND_URL),
      expectedRequest,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      UTF8_BYTES_PER_E_ACUTE,
      new URL("/api/files/scrub", BACKEND_URL),
      expectedRequest,
    );
  });
});
