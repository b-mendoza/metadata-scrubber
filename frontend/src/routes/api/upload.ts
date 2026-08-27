import { randomUUID } from "node:crypto";

import type { Register, ResolveParams } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import type { RouteMethodHandlerCtx } from "@tanstack/react-start";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import {
  MAX_FILE_SIZE_BYTES,
  UPLOADABLE_MIME_TYPES,
} from "#/domains/wizard/constants/wizard.mod";

import type { Route as RootRoute } from "../__root";

type UploadPostHandlerContext = RouteMethodHandlerCtx<
  Register,
  typeof RootRoute,
  "/api/upload",
  ResolveParams<"/api/upload">,
  unknown,
  unknown
>;

export const UPLOAD_FORM_DATA_READ_FAILURE_MESSAGE =
  "The upload request form data could not be read. Send a valid multipart/form-data request.";

const uploadableMimeTypes = Object.values(UPLOADABLE_MIME_TYPES);

const uploadedFileSchema = z
  .file({
    error:
      'The form data "file" value must be a File. Send one uploaded file in the form data field named "file".',
  })
  .max(MAX_FILE_SIZE_BYTES, {
    error: `The form data "file" value exceeds the maximum size of ${MAX_FILE_SIZE_BYTES} bytes. Select a file that is ${MAX_FILE_SIZE_BYTES} bytes or smaller.`,
  })
  .mime(uploadableMimeTypes, {
    error: `The form data "file" value has an unsupported MIME type. Select a file with one of these MIME types: ${uploadableMimeTypes.join(", ")}.`,
  });

export async function postUpload(context: UploadPostHandlerContext) {
  const formDataResult = await ResultAsync.fromThrowable(
    async () => context.request.formData(),
    (cause: unknown) =>
      new Error(UPLOAD_FORM_DATA_READ_FAILURE_MESSAGE, { cause }),
  )();
  if (formDataResult.isErr()) {
    throw formDataResult.error;
  }

  const unsafeFile = formDataResult.value.get("file");
  const validatedFile = uploadedFileSchema.parse(unsafeFile);

  const storageKey = `uploads/${randomUUID()}`;

  return Response.json({
    fileName: validatedFile.name,
    fileSizeBytes: validatedFile.size,
    mimeType: validatedFile.type,
    storageKey,
  });
}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: postUpload,
    },
  },
});
