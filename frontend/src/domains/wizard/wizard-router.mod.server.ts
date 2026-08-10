import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Schema } from "effect";

import { CONTENT_TYPE_HEADER } from "#/shared/constants/http/headers/headers.mod";
import {
  BAD_REQUEST_STATUS_CODE,
  CONFLICT_STATUS_CODE,
  NOT_FOUND_STATUS_CODE,
  OK_STATUS_CODE,
  PAYLOAD_TOO_LARGE_STATUS_CODE,
  REQUEST_TIMEOUT_STATUS_CODE,
  SERVICE_UNAVAILABLE_STATUS_CODE,
  UNPROCESSABLE_ENTITY_STATUS_CODE,
  UNSUPPORTED_MEDIA_TYPE_STATUS_CODE,
} from "#/shared/constants/http/status-codes/status-codes.mod";
import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const MAX_FILE_NAME_BYTES = 255;
const MAX_FILE_SIZE_BYTES = 10_000_000;
const MAX_PREVIEW_BYTES = 256;
const MAX_FIELDS = 128;
const JSON_MEDIA_TYPE = "application/json";
const POST_METHOD = "POST";
const GENERIC_GATEWAY_MESSAGE =
  "The file service could not complete the request.";
const STORAGE_KEY_PATTERN =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const EXPLICIT_HTTP_URL_PATTERN = /^https?:\/\//i;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const UTF8_ENCODER = new TextEncoder();
const STRICT_PARSE_OPTIONS = {
  onExcessProperty: "error",
} as const;

type EndpointIdentity = "createUpload" | "dryRun" | "scrubFile";

interface PublicError {
  readonly code: TRPC_ERROR_CODE_KEY;
  readonly message: string;
}

interface BackendJSONRequestParams<Result> {
  readonly body: object;
  readonly decodeSuccess: (body: unknown) => Promise<Result>;
  readonly endpoint: EndpointIdentity;
  readonly path: string;
  readonly signal: AbortSignal;
}

const hasMaximumUTF8Bytes = (value: string, maximum: number) =>
  UTF8_ENCODER.encode(value).byteLength <= maximum;

const hasNoControlCharacter = (value: string) =>
  !CONTROL_CHARACTER_PATTERN.test(value);

const isValidFileName = (value: string) =>
  [
    value.trim() !== "",
    !value.includes("/"),
    !value.includes("\\"),
    hasNoControlCharacter(value),
    hasMaximumUTF8Bytes(value, MAX_FILE_NAME_BYTES),
  ].every(Boolean);

const isValidETag = (value: string) =>
  [
    value !== "",
    value.trim() === value,
    hasNoControlCharacter(value),
    !value.startsWith("W/"),
    !(value.startsWith('"') && value.endsWith('"')),
  ].every(Boolean);

const isAbsoluteHTTPURL = (value: string) => {
  if (!EXPLICIT_HTTP_URL_PATTERN.test(value) || !URL.canParse(value)) {
    return false;
  }

  return HTTP_PROTOCOLS.has(new URL(value).protocol);
};

const nonEmptyStringSchema = Schema.String.check(
  Schema.makeFilter((value) => value !== "", {
    expected: "a non-empty string",
  }),
);

const fileNameSchema = Schema.String.check(
  Schema.makeFilter(isValidFileName, {
    expected: `a filename of at most ${MAX_FILE_NAME_BYTES} UTF-8 bytes`,
  }),
);

const fileSizeBytesSchema = Schema.Int.check(
  Schema.isBetween({
    maximum: MAX_FILE_SIZE_BYTES,
    minimum: 1,
  }),
);

const storageKeySchema = Schema.String.check(
  Schema.makeFilter((value) => STORAGE_KEY_PATTERN.test(value), {
    expected: "an uploads storage key with a lowercase UUID v4",
  }),
);

const etagSchema = Schema.String.check(
  Schema.makeFilter(isValidETag, {
    expected: "a canonical strong ETag",
  }),
);

const absoluteHttpURLSchema = Schema.String.check(
  Schema.makeFilter(isAbsoluteHTTPURL, {
    expected: "an absolute HTTP or HTTPS URL",
  }),
);

const previewSchema = Schema.String.check(
  Schema.makeFilter((value) => hasMaximumUTF8Bytes(value, MAX_PREVIEW_BYTES), {
    expected: `a preview of at most ${MAX_PREVIEW_BYTES} UTF-8 bytes`,
  }),
);

const createUploadInputSchema = Schema.Struct({
  fileName: fileNameSchema,
  fileSizeBytes: fileSizeBytesSchema,
});

const dryRunInputSchema = Schema.Struct({
  storageKey: storageKeySchema,
});

const scrubFileInputSchema = Schema.Struct({
  storageKey: storageKeySchema,
  etag: etagSchema,
});

const createUploadResponseSchema = Schema.Struct({
  storageKey: storageKeySchema,
  uploadUrl: absoluteHttpURLSchema,
});

const dryRunFieldSchema = Schema.Struct({
  name: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  preview: previewSchema,
  originalByteSize: Schema.Natural,
  action: Schema.Literals(["remove", "replace"]),
});

const dryRunResponseSchema = Schema.Struct({
  etag: etagSchema,
  fields: Schema.Array(dryRunFieldSchema).check(Schema.isMaxLength(MAX_FIELDS)),
});

const scrubFileResponseSchema = Schema.Struct({
  status: Schema.Literal("done"),
  result: Schema.Struct({
    downloadUrl: absoluteHttpURLSchema,
  }),
});

const backendErrorSchema = Schema.Struct({
  error: Schema.String,
});

const createUploadInput = Schema.toStandardSchemaV1(createUploadInputSchema, {
  parseOptions: STRICT_PARSE_OPTIONS,
});
const dryRunInput = Schema.toStandardSchemaV1(dryRunInputSchema, {
  parseOptions: STRICT_PARSE_OPTIONS,
});
const scrubFileInput = Schema.toStandardSchemaV1(scrubFileInputSchema, {
  parseOptions: STRICT_PARSE_OPTIONS,
});

const decodeCreateUploadResponse = Schema.decodeUnknownPromise(
  createUploadResponseSchema,
  STRICT_PARSE_OPTIONS,
);
const decodeDryRunResponse = Schema.decodeUnknownPromise(
  dryRunResponseSchema,
  STRICT_PARSE_OPTIONS,
);
const decodeScrubFileResponse = Schema.decodeUnknownPromise(
  scrubFileResponseSchema,
  STRICT_PARSE_OPTIONS,
);
const decodeBackendError = Schema.decodeUnknownPromise(
  backendErrorSchema,
  STRICT_PARSE_OPTIONS,
);

const publicErrors: Record<
  EndpointIdentity,
  Readonly<Partial<Record<number, PublicError>>>
> = {
  createUpload: {
    [BAD_REQUEST_STATUS_CODE]: {
      code: "BAD_REQUEST",
      message: "The upload request is invalid.",
    },
    [REQUEST_TIMEOUT_STATUS_CODE]: {
      code: "TIMEOUT",
      message: "The upload request timed out.",
    },
  },
  dryRun: {
    [BAD_REQUEST_STATUS_CODE]: {
      code: "BAD_REQUEST",
      message: "The PDF could not be inspected.",
    },
    [NOT_FOUND_STATUS_CODE]: {
      code: "NOT_FOUND",
      message: "The uploaded file was not found.",
    },
    [REQUEST_TIMEOUT_STATUS_CODE]: {
      code: "TIMEOUT",
      message: "The PDF review timed out.",
    },
    [PAYLOAD_TOO_LARGE_STATUS_CODE]: {
      code: "PAYLOAD_TOO_LARGE",
      message: "The PDF is larger than 10 MB.",
    },
    [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE]: {
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "The uploaded file is not a PDF.",
    },
    [UNPROCESSABLE_ENTITY_STATUS_CODE]: {
      code: "UNPROCESSABLE_CONTENT",
      message: "Signed PDF files are not supported.",
    },
    [SERVICE_UNAVAILABLE_STATUS_CODE]: {
      code: "SERVICE_UNAVAILABLE",
      message: "PDF processing is temporarily unavailable. Try again.",
    },
  },
  scrubFile: {
    [BAD_REQUEST_STATUS_CODE]: {
      code: "BAD_REQUEST",
      message: "The scrub request is invalid.",
    },
    [NOT_FOUND_STATUS_CODE]: {
      code: "NOT_FOUND",
      message: "The uploaded file was not found.",
    },
    [REQUEST_TIMEOUT_STATUS_CODE]: {
      code: "TIMEOUT",
      message: "The PDF scrub timed out.",
    },
    [CONFLICT_STATUS_CODE]: {
      code: "CONFLICT",
      message: "The file changed after review. Review it again.",
    },
    [PAYLOAD_TOO_LARGE_STATUS_CODE]: {
      code: "PAYLOAD_TOO_LARGE",
      message: "The PDF is larger than 10 MB.",
    },
    [UNSUPPORTED_MEDIA_TYPE_STATUS_CODE]: {
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "The uploaded file is not a PDF.",
    },
    [UNPROCESSABLE_ENTITY_STATUS_CODE]: {
      code: "UNPROCESSABLE_CONTENT",
      message: "Signed PDF files are not supported.",
    },
    [SERVICE_UNAVAILABLE_STATUS_CODE]: {
      code: "SERVICE_UNAVAILABLE",
      message: "PDF processing is temporarily unavailable. Try again.",
    },
  },
};

const createGatewayError = () =>
  new TRPCError({
    code: "BAD_GATEWAY",
    message: GENERIC_GATEWAY_MESSAGE,
  });

const runUpstreamOperation = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> =>
  operation().then(
    (result) => result,
    () => {
      throw createGatewayError();
    },
  );

const readResponseJSON = async (response: Response): Promise<unknown> =>
  runUpstreamOperation(async () => response.json());

const decodeResponse = async <Result>(
  decode: (body: unknown) => Promise<Result>,
  body: unknown,
): Promise<Result> => runUpstreamOperation(async () => decode(body));

const getPublicError = (
  endpoint: EndpointIdentity,
  status: number,
): PublicError | undefined => publicErrors[endpoint][status];

const requestBackendJSON = async <Result>({
  body,
  decodeSuccess,
  endpoint,
  path,
  signal,
}: BackendJSONRequestParams<Result>): Promise<Result> => {
  const { env } = getApplicationBindings();
  const url = new URL(path, env.BACKEND_URL);
  const response = await runUpstreamOperation(async () =>
    fetch(url, {
      body: JSON.stringify(body),
      headers: {
        [CONTENT_TYPE_HEADER]: JSON_MEDIA_TYPE,
      },
      method: POST_METHOD,
      signal,
    }),
  );
  const responseBody = await readResponseJSON(response);

  if (response.status === OK_STATUS_CODE) {
    return decodeResponse(decodeSuccess, responseBody);
  }

  await decodeResponse(decodeBackendError, responseBody);

  const publicError = getPublicError(endpoint, response.status);
  if (publicError === undefined) {
    throw createGatewayError();
  }

  throw new TRPCError(publicError);
};

export const wizardRouter = createTRPCRouter({
  createUpload: publicProcedure
    .input(createUploadInput)
    .mutation(async ({ ctx, input }) =>
      requestBackendJSON({
        body: {
          fileName: input.fileName,
          fileSizeBytes: input.fileSizeBytes,
        },
        decodeSuccess: decodeCreateUploadResponse,
        endpoint: "createUpload",
        path: "/api/uploads",
        signal: ctx.signal,
      }),
    ),
  dryRun: publicProcedure.input(dryRunInput).mutation(async ({ ctx, input }) =>
    requestBackendJSON({
      body: {
        storageKey: input.storageKey,
      },
      decodeSuccess: decodeDryRunResponse,
      endpoint: "dryRun",
      path: "/api/files/dry-run",
      signal: ctx.signal,
    }),
  ),
  scrubFile: publicProcedure
    .input(scrubFileInput)
    .mutation(async ({ ctx, input }) =>
      requestBackendJSON({
        body: {
          storageKey: input.storageKey,
          etag: input.etag,
        },
        decodeSuccess: decodeScrubFileResponse,
        endpoint: "scrubFile",
        path: "/api/files/scrub",
        signal: ctx.signal,
      }),
    ),
});
