import Uppy from "@uppy/core";
import { useUppyEvent } from "@uppy/react";
import Dashboard from "@uppy/react/dashboard";
import XHRUpload from "@uppy/xhr-upload";
import { useEffect, useState } from "react";
import * as z from "zod";

import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  UPLOADABLE_MIME_TYPES,
  WIZARD_UPLOAD_FILE_COUNT,
} from "#/domains/wizard/constants/wizard.mod";

const uploadedFileResponseBodySchema = z.object({
  fileName: z.string().trim(),
  fileSizeBytes: z.int(),
  mimeType: z.enum(UPLOADABLE_MIME_TYPES),
  storageKey: z.string().trim(),
});

export interface UploadedFileResponseBody extends z.output<
  typeof uploadedFileResponseBodySchema
> {}

const uploadedFileResponseSchema = z.object({
  response: z.object({
    body: uploadedFileResponseBodySchema,
  }),
});

const uploadedFilesSchema = z.array(uploadedFileResponseSchema);

const uploadResultSchema = z.object({
  successful: uploadedFilesSchema,
});

interface FileUploaderProps {
  onFilesChange: (files: UploadedFileResponseBody[]) => void;
}

const createUppy = () => {
  return new Uppy({
    restrictions: {
      allowedFileTypes: Object.values(UPLOADABLE_MIME_TYPES),
      maxFileSize: MAX_FILE_SIZE_BYTES,
      maxNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
      minNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
    },
    autoProceed: false,
  }).use(XHRUpload, {
    endpoint: "/api/upload",
    fieldName: "file",
  });
};

export const FileUploader = (props: FileUploaderProps) => {
  const { onFilesChange } = props;

  // useState accepts an initializer function that only runs on mount. Without it,
  // `createUppy()` would execute on every render, creating new Uppy instances
  // with their own internal state (event listeners, plugins, upload progress).
  const [uppy] = useState(() => createUppy());

  useUppyEvent(uppy, "complete", (uploadResult) => {
    const { successful: successfulFiles } =
      uploadResultSchema.parse(uploadResult);

    const normalizedSuccessfullyUploadedFiles = successfulFiles.map(
      (file) => file.response.body,
    );

    onFilesChange(normalizedSuccessfullyUploadedFiles);
  });

  useEffect(() => {
    return () => {
      uppy.destroy();
    };
  }, [uppy]);

  return (
    <Dashboard
      height={400}
      hideProgressAfterFinish
      note={`Upload exactly ${WIZARD_UPLOAD_FILE_COUNT} files (images or PDFs, max ${MAX_FILE_SIZE_MB}MB each)`}
      uppy={uppy}

      // If a user removes a completed file, they would need to re-upload a
      // replacement. We haven't built that flow yet (resetting upload state,
      // re-triggering the `complete` event, etc.), so we keep the remove button
      // and progress hidden after completion to avoid a broken state.
      // showRemoveButtonAfterComplete
    />
  );
};
