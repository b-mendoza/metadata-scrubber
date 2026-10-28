import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import { useEffect, useEffectEvent, useRef } from "react";
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
const fileSizeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const uploadedFileMetadataSchema = z.object({
  storageKey: z.string().trim().nonempty(),
});

interface FileUploaderProps {
  createUpload: (
    input: RouterInputs["wizard"]["createUpload"],
  ) => Promise<RouterOutputs["wizard"]["createUpload"]>;
  maxFileSizeBytes: number;
  onUploadComplete: (result: { storageKey: string }) => void;
}

const useUppyDashboard = (props: FileUploaderProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const getInitialProps = useEffectEvent(() => props);
  const onComplete = useEffectEvent(props.onUploadComplete);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }

    // Remount to change the captured `createUpload` and `maxFileSizeBytes` values.
    const { createUpload, maxFileSizeBytes } = getInitialProps();
    const instance = new Uppy({
      restrictions: {
        allowedFileTypes: [UPLOADABLE_MIME_TYPES.PDF],
        maxFileSize: maxFileSizeBytes,
        maxNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
        minNumberOfFiles: WIZARD_UPLOAD_FILE_COUNT,
      },
    });

    instance.use(AwsS3, {
      generateObjectKey: (file) => file.id,
      shouldUseMultipart: false,
      signRequest: async (request) => {
        if (request.method !== "PUT") {
          throw new Error("Only PUT upload requests are supported");
        }

        const file = instance.getFile(request.key);
        if (file.size == null) {
          throw new Error("The upload file size is not available");
        }

        const upload = createUpload({
          fileName: file.name,
          fileSizeBytes: file.size,
        });
        // eslint-disable-next-line unicorn/prefer-await -- Replace only the grant rejection without retaining private fields or its cause.
        const { storageKey, uploadUrl } = await upload.catch(() => {
          throw new Error("Could not create the upload. Try again.");
        });

        instance.setFileMeta(file.id, { storageKey });

        return { url: uploadUrl };
      },
    });

    const maxFileSizeMebibytes = fileSizeFormatter.format(
      maxFileSizeBytes / BYTES_PER_MEBIBYTE,
    );
    instance.use(Dashboard, {
      inline: true,
      target: container,
      height: 400,
      hideProgressAfterFinish: true,
      note: `Upload exactly one PDF file (max ${maxFileSizeMebibytes} MiB)`,
    });
    instance.on("complete", (uploadResult) => {
      const [successfulFile] = uploadResult.successful ?? [];
      if (successfulFile == null) {
        return;
      }

      const uploadedFileMetadata = uploadedFileMetadataSchema.parse({
        storageKey: successfulFile.meta["storageKey"],
      });

      onComplete(uploadedFileMetadata);
    });

    return () => {
      instance.destroy();
    };
  }, []);

  return containerRef;
};

export const FileUploader = (props: FileUploaderProps) => {
  const containerRef = useUppyDashboard(props);

  return <div ref={containerRef} />;
};
