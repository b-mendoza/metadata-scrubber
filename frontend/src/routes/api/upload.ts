import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import * as z from "zod";

import {
  MAX_FILE_SIZE_BYTES,
  UPLOADABLE_MIME_TYPES,
} from "#/domains/wizard/constants/wizard.mod";
import { getApplicationBindings } from "#/shared/middlewares/application-bindings/application-bindings.mod";

const uploadedFileSchema = z
  .file()
  .max(MAX_FILE_SIZE_BYTES)
  .mime(Object.values(UPLOADABLE_MIME_TYPES));

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      async POST(ctx) {
        const formData = await ctx.request.formData();

        const unsafeFile = formData.get("file");

        const validatedFile = uploadedFileSchema.parse(unsafeFile);

        const storageKey = `uploads/${randomUUID()}`;

        const { storage } = getApplicationBindings();

        await storage.put(storageKey, validatedFile.stream(), {
          contentType: validatedFile.type,
        });

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
