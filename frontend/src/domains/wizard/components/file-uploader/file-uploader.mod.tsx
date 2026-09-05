import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import { useUppyEvent } from "@uppy/react";
import Dashboard from "@uppy/react/dashboard";
import { useEffect, useState } from "react";
import * as z from "zod";

import {
  UPLOADABLE_MIME_TYPES,
  WIZARD_UPLOAD_FILE_COUNT,
} from "#/domains/wizard/constants/wizard.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";

const BYTES_PER_MEBIBYTE = 1_048_576;

const uploadedFileMetadataSchema = z.strictObject({
  storageKey: z.string().trim().nonempty(),
});

interface FileUploaderProps {
  createUpload: (
    input: RouterInputs["wizard"]["createUpload"],
  ) => Promise<RouterOutputs["wizard"]["createUpload"]>;
  maxFileSizeBytes: number;
  onUploadComplete: (result: { storageKey: string }) => void;
}

const createUppy = (
  createUpload: FileUploaderProps["createUpload"],
  maxFileSizeBytes: FileUploaderProps["maxFileSizeBytes"],
) => {
  const uppy = new Uppy({
    restrictions: {
      allowedFileTypes: [UPLOADABLE_MIME_TYPES.PDF],
      maxFileSize: maxFileSizeBytes,
      maxNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
      minNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
    },
    autoProceed: false,
  });

  uppy.use(AwsS3, {
    generateObjectKey: (file) => file.id,
    shouldUseMultipart: false,
    signRequest: async (request) => {
      if (request.method !== "PUT") {
        throw new Error("Only PUT upload requests are supported");
      }

      const file = uppy.getFile(request.key);
      if (file.size == null) {
        throw new Error("The upload file size is not available");
      }

      const { storageKey, uploadUrl } = await createUpload({
        fileName: file.name,
        fileSizeBytes: file.size,
      });

      uppy.setFileMeta(file.id, { storageKey });

      return { url: uploadUrl };
    },
  });

  return uppy;
};

const formatMebibytes = (fileSizeBytes: number) => {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(fileSizeBytes / BYTES_PER_MEBIBYTE);
};

export const FileUploader = (props: FileUploaderProps) => {
  const { createUpload, maxFileSizeBytes, onUploadComplete } = props;

  // useState creates one Uppy instance for each mount, not each render.
  // The instance captures fixed `createUpload` and `maxFileSizeBytes` values at mount.
  // A caller must remount this component to apply a different value.
  const [uppy] = useState(() => createUppy(createUpload, maxFileSizeBytes));

  useUppyEvent(uppy, "complete", (uploadResult) => {
    const [successfulFile] = uploadResult.successful ?? [];
    if (successfulFile == null) {
      return;
    }

    const uploadedFileMetadata = uploadedFileMetadataSchema.parse({
      storageKey: successfulFile.meta["storageKey"],
    });

    onUploadComplete(uploadedFileMetadata);
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
      note={`Upload exactly one PDF file (max ${formatMebibytes(maxFileSizeBytes)} MiB)`}
      uppy={uppy}
    />
  );
};
