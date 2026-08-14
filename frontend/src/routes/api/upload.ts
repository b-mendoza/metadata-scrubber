import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect, Schema } from "effect";

import {
  MAX_FILE_SIZE_BYTES,
  UPLOADABLE_MIME_TYPES,
} from "#/domains/wizard/constants/wizard.mod";

const uploadableMimeTypes = Object.values(UPLOADABLE_MIME_TYPES);

const uploadedFileSchema = Schema.File.check(
  Schema.makeFilter((file) => file.size <= MAX_FILE_SIZE_BYTES, {
    message: `File must be at most ${MAX_FILE_SIZE_BYTES} bytes`,
  }),
  Schema.makeFilter(
    (file) =>
      uploadableMimeTypes.some(
        (uploadableMimeType) => uploadableMimeType === file.type,
      ),
    { message: "File MIME type is not uploadable" },
  ),
);
const decodeUploadedFile = Schema.decodeUnknownEffect(uploadedFileSchema);

class RequestFormDataError extends Data.TaggedError("RequestFormDataError")<{
  readonly cause: unknown;
}> {}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      async POST(ctx) {
        const uploadEffect = Effect.gen(function* () {
          const formData = yield* Effect.tryPromise({
            try: async () => ctx.request.formData(),
            catch: (cause) => new RequestFormDataError({ cause }),
          });

          const unsafeFile = formData.get("file");
          const validatedFile = yield* decodeUploadedFile(unsafeFile);

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
