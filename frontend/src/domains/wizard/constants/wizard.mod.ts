import type * as z from "zod";

const BYTES_PER_KB = 1024; // 1KB = 1024 bytes
const KB_PER_MB = 1024; // 1MB = 1024KB

export const MAX_FILE_SIZE_MB = 10; // 10MB

export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * KB_PER_MB * BYTES_PER_KB; // 10,485,760 bytes = 10MB * 1024KB * 1024 bytes

export const UPLOADABLE_MIME_TYPES = {
  PDF: "application/pdf",
} satisfies Record<string, z.util.MimeTypes>;

export type UploadableMimeType =
  (typeof UPLOADABLE_MIME_TYPES)[keyof typeof UPLOADABLE_MIME_TYPES];

export const WIZARD_UPLOAD_FILE_COUNT = 1;
