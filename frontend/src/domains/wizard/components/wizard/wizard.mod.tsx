import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

import {
  QueryErrorResetBoundary,
  useMutation,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CatchBoundary } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { RefObject } from "react";
import { Suspense, useEffect, useRef } from "react";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface WizardUploadProps {
  trpc: TRPCOptionsProxy<AppRouter>;
  onUploadComplete: (input: RouterInputs["wizard"]["dryRun"]) => void;
}
interface WizardUploadSettingsProps {
  trpc: TRPCOptionsProxy<AppRouter>;
  onUploadComplete: (input: RouterInputs["wizard"]["dryRun"]) => void;
  generationRef: RefObject<number>;
  uploadStartedRef: RefObject<boolean>;
}
const INITIAL_GENERATION = 0;
const GENERATION_INCREMENT = 1;
const useUploadSessionGeneration = () => {
  const generationRef = useRef(INITIAL_GENERATION);
  useEffect(
    () => () => {
      generationRef.current += GENERATION_INCREMENT;
    },
    [],
  );
  return generationRef;
};
function WizardUploadSettings({
  trpc,
  onUploadComplete,
  generationRef,
  uploadStartedRef,
}: Readonly<WizardUploadSettingsProps>) {
  const config = useSuspenseQuery({
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
  const uploadGeneration = generationRef.current;
  return (
    <>
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
          onUploadComplete(result);
        }}
      />
    </>
  );
}
export function WizardUpload({
  trpc,
  onUploadComplete,
}: Readonly<WizardUploadProps>) {
  const generationRef = useUploadSessionGeneration();
  const uploadStartedRef = useRef(false);
  return (
    <section>
      <h2 id="upload-heading" tabIndex={-1}>
        Upload a PDF
      </h2>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <CatchBoundary
            getResetKey={() => "wizard-upload-settings"}
            errorComponent={({ reset: resetCatch }) => (
              <div role="alert">
                Could not load upload settings.
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    reset();
                    resetCatch();
                  }}
                >
                  Retry settings
                </button>
              </div>
            )}
          >
            <Suspense fallback={<p role="status">Loading upload settings…</p>}>
              <WizardUploadSettings
                trpc={trpc}
                onUploadComplete={(result) => {
                  uploadStartedRef.current = true;
                  onUploadComplete(result);
                }}
                generationRef={generationRef}
                uploadStartedRef={uploadStartedRef}
              />
            </Suspense>
          </CatchBoundary>
        )}
      </QueryErrorResetBoundary>
    </section>
  );
}
