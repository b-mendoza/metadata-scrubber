import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod";

import {
  MAX_FILE_SIZE_BYTES,
  UPLOADABLE_MIME_TYPES,
} from "#/domains/wizard/constants/wizard.mod";

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

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      async POST(context) {
        const formData = await (async () => {
          try {
            return await context.request.formData();
          } catch (error: unknown) {
            throw new Error(
              "The upload request form data could not be read. Send a valid multipart/form-data request.",
              { cause: error },
            );
          }
        })();

        const unsafeFile = formData.get("file");
        const validatedFile = uploadedFileSchema.parse(unsafeFile);

        const storageKey = `uploads/${randomUUID()}`;

        return Response.json({
          fileName: validatedFile.name,
          fileSizeBytes: validatedFile.size,
          mimeType: validatedFile.type,
          storageKey,
        });
      },
    },
  },
});
