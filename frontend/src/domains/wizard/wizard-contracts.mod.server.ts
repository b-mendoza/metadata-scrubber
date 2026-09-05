import * as z from "zod";

const MINIMUM_FILE_SIZE_BYTES = 1;
const MINIMUM_TEXT_LENGTH = 1;
const WHOLE_SECOND_PRECISION = 0;
// Zod string length counts UTF-16 code units. The byte limit must use TextEncoder.
const MAXIMUM_FILE_NAME_BYTES = 255;
const HTTP_PROTOCOL = /^https?$/;
const INVALID_FILE_NAME_CHARACTERS = new Set(["\\", "/", "\u{FFFD}"]);
const LAST_CONTROL_CHARACTER = "\u{001F}";
const DELETE_CONTROL_CHARACTER = "\u{007F}";
// This regex matches the backend wire grammar: uploads/ and a lowercase UUIDv4.
// A separate z.uuid() check would accept UUID forms that the backend does not emit.
const STORAGE_KEY_PATTERN =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// This token is 32 lowercase hexadecimal characters, not a general RFC 9110 entity tag.
const CANONICAL_ETAG_PATTERN = /^[0-9a-f]{32}$/;

// This loop replaces a control-character regex that no-control-regex forbids.
const fileNameContainsInvalidCharacter = (value: string): boolean => {
  for (const character of value) {
    if (
      INVALID_FILE_NAME_CHARACTERS.has(character) ||
      character <= LAST_CONTROL_CHARACTER ||
      character === DELETE_CONTROL_CHARACTER
    ) {
      return true;
    }
  }
  return false;
};

// eslint-disable-next-line zod/prefer-string-schema-with-trim -- File names must reach the backend byte-for-byte, so this schema rejects padding instead of trimming.
const fileNameSchema = z
  .string({ error: "The file name must be a string." })
  .refine((value) => value.trim().length >= MINIMUM_TEXT_LENGTH, {
    abort: true,
    error: "The file name must not be empty.",
  })
  .refine((value) => value === value.trim(), {
    error: "The file name must not start or end with whitespace.",
  })
  .refine(
    (value) =>
      new TextEncoder().encode(value).byteLength <= MAXIMUM_FILE_NAME_BYTES,
    { error: "The file name is too long." },
  )
  .refine((value) => !fileNameContainsInvalidCharacter(value), {
    error: "The file name contains a character that is not allowed.",
  });

const storageKeySchema = z
  .string({ error: "The storage key must be a string." })
  .regex(STORAGE_KEY_PATTERN, { error: "The storage key is invalid." })
  .trim();
export const canonicalETagSchema = z
  .string({ error: "The ETag must be a string." })
  .regex(CANONICAL_ETAG_PATTERN, { error: "The ETag is invalid." })
  .trim();

export const workflowConfigResponseSchema = z.strictObject({
  maxFileSizeBytes: z.int().positive(),
});

export const createUploadInputSchema = z.strictObject({
  fileName: fileNameSchema,
  fileSizeBytes: z.int().min(MINIMUM_FILE_SIZE_BYTES),
});

export const createUploadResponseSchema = z.strictObject({
  storageKey: storageKeySchema,
  uploadUrl: z.url({ protocol: HTTP_PROTOCOL }),
});

export const dryRunInputSchema = z.strictObject({
  storageKey: storageKeySchema,
});

const publicFieldSchema = z.strictObject({
  action: z.enum(["remove", "replace"]),
  label: z.string().trim(),
  name: z.string().trim(),
  originalByteSize: z.int().nonnegative(),
  preview: z.string().trim(),
});

export const dryRunResponseSchema = z.strictObject({
  etag: canonicalETagSchema,
  fields: z.array(publicFieldSchema),
});

export const scrubFileInputSchema = z.strictObject({
  etag: canonicalETagSchema,
  storageKey: storageKeySchema,
});

export const scrubFileResponseSchema = z.strictObject({
  result: z.strictObject({
    downloadUrl: z.url({ protocol: HTTP_PROTOCOL }),
  }),
  status: z.literal("done"),
});

export const refreshDownloadGrantInputSchema = z.strictObject({
  etag: canonicalETagSchema,
  storageKey: storageKeySchema,
});

export const refreshDownloadGrantResponseSchema = z.strictObject({
  downloadUrl: z.url({ protocol: HTTP_PROTOCOL }),
  expiresAt: z.iso.datetime({ precision: WHOLE_SECOND_PRECISION }),
});

export const confirmDeleteInputSchema = z.strictObject({
  storageKey: storageKeySchema,
});

export const confirmDeleteResponseSchema = z.strictObject({
  status: z.literal("deleted"),
});

export const backendErrorResponseSchema = z.strictObject({
  error: z.string().trim().min(MINIMUM_TEXT_LENGTH),
});

export type WorkflowConfig = z.output<typeof workflowConfigResponseSchema>;
export type CreateUploadInput = z.input<typeof createUploadInputSchema>;
export type CreateUploadResponse = z.output<typeof createUploadResponseSchema>;
export type DryRunInput = z.input<typeof dryRunInputSchema>;
export type DryRunResponse = z.output<typeof dryRunResponseSchema>;
export type ScrubFileInput = z.input<typeof scrubFileInputSchema>;
export type ScrubFileResponse = z.output<typeof scrubFileResponseSchema>;
export type RefreshDownloadGrantInput = z.input<
  typeof refreshDownloadGrantInputSchema
>;
export type RefreshDownloadGrantResponse = z.output<
  typeof refreshDownloadGrantResponseSchema
>;
export type ConfirmDeleteInput = z.input<typeof confirmDeleteInputSchema>;
export type ConfirmDeleteResponse = z.output<
  typeof confirmDeleteResponseSchema
>;
