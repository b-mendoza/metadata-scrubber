import * as z from "zod";

import {
  canonicalETagSchema,
  storageKeySchema,
} from "./wizard-identifiers.mod";

const MINIMUM_FILE_SIZE_BYTES = 1;
const WHOLE_SECOND_PRECISION = 0;
// Zod string length counts UTF-16 code units. The byte limit must use TextEncoder.
const MAXIMUM_FILE_NAME_BYTES = 255;
const HTTP_PROTOCOL = /^https?$/v;
const INVALID_FILE_NAME_CHARACTERS = new Set(["\\", "/", "\u{FFFD}"]);
const LAST_CONTROL_CHARACTER = "\u{001F}";
const DELETE_CONTROL_CHARACTER = "\u{007F}";

// This loop replaces a control-character regex that no-control-regex forbids.
const hasInvalidFileNameCharacter = (value: string): boolean => {
  for (const character of value) {
    if (
      character === DELETE_CONTROL_CHARACTER ||
      character <= LAST_CONTROL_CHARACTER ||
      INVALID_FILE_NAME_CHARACTERS.has(character)
    ) {
      return true;
    }
  }
  return false;
};

// eslint-disable-next-line zod/prefer-string-schema-with-trim -- File names must reach the backend byte-for-byte, so this schema rejects padding instead of trimming.
const fileNameSchema = z
  .string({ error: "The file name must be a string." })
  .refine((value) => value.trim() !== "", {
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
  .refine((value) => !hasInvalidFileNameCharacter(value), {
    error: "The file name contains a character that is not allowed.",
  });

export const workflowConfigResponseSchema = z.strictObject({
  maxFileSizeBytes: z.int().positive(),
});

export const uploadInputSchema = z.strictObject({
  fileName: fileNameSchema,
  fileSizeBytes: z.int().min(MINIMUM_FILE_SIZE_BYTES),
});

export const uploadResponseSchema = z.strictObject({
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
  error: z.string().trim().nonempty(),
});

export type WorkflowConfig = z.output<typeof workflowConfigResponseSchema>;
export type CreateUploadInput = z.input<typeof uploadInputSchema>;
export type CreateUploadResponse = z.output<typeof uploadResponseSchema>;
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
export type BackendErrorResponse = z.output<typeof backendErrorResponseSchema>;
