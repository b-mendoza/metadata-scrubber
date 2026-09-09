import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useEffect, useRef } from "react";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface WizardUploadProps {
  trpc: TRPCOptionsProxy<AppRouter>;
  onUploadComplete: (input: RouterInputs["wizard"]["dryRun"]) => void;
}
const INITIAL_GENERATION = 0;
const GENERATION_INCREMENT = 1;
export function WizardUpload({
  trpc,
  onUploadComplete,
}: Readonly<WizardUploadProps>) {
  const generationRef = useRef(INITIAL_GENERATION);
  const uploadStartedRef = useRef(false);
  const uploadHeadingRef = useRef<HTMLHeadingElement>(null);
  const config = useQuery({
    ...trpc.wizard.getWorkflowConfig.queryOptions(),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    refetchOnMount: false,
  });
  const upload = useMutation(
    trpc.wizard.createUpload.mutationOptions({ retry: false }),
  );
  useEffect(
    () => () => {
      generationRef.current += GENERATION_INCREMENT;
    },
    [],
  );
  const uploadGeneration = generationRef.current;
  return (
    <section>
      <h2 ref={uploadHeadingRef} id="upload-heading" tabIndex={-1}>
        Upload a PDF
      </h2>
      {config.isPending && <p role="status">Loading upload settings…</p>}
      {config.isError && (
        <div role="alert">
          Could not load upload settings.
          <button
            type="button"
            className="btn"
            onClick={() => {
              void config.refetch();
            }}
          >
            Retry settings
          </button>
        </div>
      )}
      {config.data != null && (
        <FileUploader
          createUpload={upload.mutateAsync}
          maxFileSizeBytes={config.data.maxFileSizeBytes}
          onUploadComplete={(result) => {
            if (
              uploadStartedRef.current ||
              uploadGeneration !== generationRef.current
            ) {
              return;
            }
            uploadStartedRef.current = true;
            onUploadComplete(result);
          }}
        />
      )}
    </section>
  );
}
