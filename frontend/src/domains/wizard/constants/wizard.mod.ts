import type * as z from "zod";

export const UPLOADABLE_MIME_TYPES = {
  PDF: "application/pdf",
} satisfies Record<string, z.util.MimeTypes>;

export type UploadableMimeType =
  (typeof UPLOADABLE_MIME_TYPES)[keyof typeof UPLOADABLE_MIME_TYPES];

export const WIZARD_UPLOAD_FILE_COUNT = 1;
