import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect } from "effect";
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

class RequestFormDataError extends Data.TaggedError("RequestFormDataError")<{
  readonly cause: unknown;
}> {}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      async POST(context) {
        const uploadEffect = Effect.gen(function* () {
          const formData = yield* Effect.tryPromise({
            try: async () => context.request.formData(),
            catch: (cause) => new RequestFormDataError({ cause }),
          });

          const unsafeFile = formData.get("file");
          const validatedFile = uploadedFileSchema.parse(unsafeFile);

          const storageKey = `uploads/${randomUUID()}`;

          return Response.json({
            fileName: validatedFile.name,
            fileSizeBytes: validatedFile.size,
            mimeType: validatedFile.type,
            storageKey,
          });
        });

        return Effect.runPromise(uploadEffect);
      },
    },
  },
});
