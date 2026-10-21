// eslint-disable-next-line no-restricted-imports -- Local settings recovery keeps the uploader unmounted until the user retries.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

import { FileWorkflowReview } from "./file-workflow-screens.mod";

type ReviewedPDF = RouterInputs["wizard"]["dryRun"] &
  RouterOutputs["wizard"]["dryRun"];
type Flow =
  | { step: "upload" | "inspecting" | "inspection-failed" }
  | { step: "review"; review: ReviewedPDF };

const focusWorkflowHeading = (heading: HTMLHeadingElement | null) => {
  heading?.focus();
};

export function FileWorkflow() {
  const trpc = trpcContext.useTRPC();
  const config = useQuery({
    ...trpc.wizard.getWorkflowConfig.queryOptions(),
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
  const upload = useMutation(
    trpc.wizard.createUpload.mutationOptions({ retry: false }),
  );
  const inspection = useMutation(
    trpc.wizard.dryRun.mutationOptions({ retry: false }),
  );
  const [flow, setFlow] = useState<Flow>({ step: "upload" });
  const uploadClaimedRef = useRef(false);

  const inspectFile = (input: RouterInputs["wizard"]["dryRun"]) => {
    if (uploadClaimedRef.current) {
      return;
    }
    uploadClaimedRef.current = true;
    setFlow({ step: "inspecting" });
    void inspection
      .mutateAsync(input)
      .then((result) => {
        setFlow({ step: "review", review: { ...input, ...result } });
      })
      .catch(() => {
        setFlow({ step: "inspection-failed" });
      });
  };

  return (
    // eslint-disable-next-line better-tailwindcss/no-unknown-classes -- PostHog requires this capture-exclusion class on private workflow DOM.
    <main className="ph-no-capture mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-3xl font-bold">Metadata Scrubber</h1>
      {config.isPending ? (
        <output aria-label="Loading upload settings">
          Loading upload settings.
        </output>
      ) : null}
      {config.isError ? (
        <>
          <p role="alert">Could not load upload settings. Try again.</p>
          <button
            className="btn"
            onClick={() => {
              void config.refetch();
            }}
            type="button"
          >
            Retry settings
          </button>
        </>
      ) : null}
      {config.isSuccess && flow.step === "upload" ? (
        <>
          <h2 ref={focusWorkflowHeading} tabIndex={-1}>
            Upload PDF
          </h2>
          <FileUploader
            createUpload={upload.mutateAsync}
            maxFileSizeBytes={config.data.maxFileSizeBytes}
            onUploadComplete={inspectFile}
          />
        </>
      ) : null}
      {flow.step === "inspecting" ? (
        <>
          <h2 ref={focusWorkflowHeading} tabIndex={-1}>
            Inspect PDF
          </h2>
          <output aria-label="Inspecting PDF">
            Inspecting the PDF. Please wait.
          </output>
        </>
      ) : null}
      {flow.step === "review" ? (
        <FileWorkflowReview
          fields={flow.review.fields}
          headingRef={focusWorkflowHeading}
        />
      ) : null}
      {flow.step === "inspection-failed" ? (
        <>
          <h2 ref={focusWorkflowHeading} tabIndex={-1}>
            Could not inspect PDF
          </h2>
          <p role="alert">Could not inspect the PDF.</p>
        </>
      ) : null}
    </main>
  );
}
