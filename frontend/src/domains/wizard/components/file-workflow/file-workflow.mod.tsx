// eslint-disable-next-line no-restricted-imports -- Local settings recovery keeps the uploader unmounted until the user retries.
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { useRef, useState } from "react";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

import {
  FileWorkflowResult,
  FileWorkflowReview,
} from "./file-workflow-screens.mod";

type ReviewedPDF = RouterInputs["wizard"]["dryRun"] &
  RouterOutputs["wizard"]["dryRun"];
type Flow =
  | { step: "upload"; isSourceMissing: boolean }
  | { step: "inspecting" }
  | { step: "inspection-failed" }
  | { step: "review" | "scrubbing" | "scrub-failed"; review: ReviewedPDF }
  | { step: "done"; review: ReviewedPDF };

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
  const scrub = useMutation(
    trpc.wizard.scrubFile.mutationOptions({ retry: false }),
  );
  const [flow, setFlow] = useState<Flow>({
    step: "upload",
    isSourceMissing: false,
  });
  const [generation, setGeneration] = useState(() =>
    Symbol("workflow generation"),
  );
  const currentGenerationRef = useRef(generation);
  const uploadClaimedRef = useRef(false);
  const scrubPendingRef = useRef(false);

  const inspectFile = (input: RouterInputs["wizard"]["dryRun"]) => {
    if (
      currentGenerationRef.current !== generation ||
      uploadClaimedRef.current
    ) {
      return;
    }
    uploadClaimedRef.current = true;
    setFlow({ step: "inspecting" });
    void inspection
      .mutateAsync(input)
      .then((result) => {
        if (currentGenerationRef.current !== generation) {
          return;
        }
        setFlow({ step: "review", review: { ...input, ...result } });
      })
      .catch((error: unknown) => {
        if (currentGenerationRef.current !== generation) {
          return;
        }
        if (
          isTRPCClientError<AppRouter>(error) &&
          error.data?.code === "NOT_FOUND"
        ) {
          restart(true);
          return;
        }
        setFlow({ step: "inspection-failed" });
      });
  };

  const scrubFile = (review: ReviewedPDF) => {
    if (
      currentGenerationRef.current !== generation ||
      scrubPendingRef.current
    ) {
      return;
    }
    scrubPendingRef.current = true;
    setFlow({ step: "scrubbing", review });
    const input: RouterInputs["wizard"]["scrubFile"] = {
      storageKey: review.storageKey,
      etag: review.etag,
    };
    void scrub
      .mutateAsync(input)
      .then(() => {
        if (currentGenerationRef.current !== generation) {
          return;
        }
        scrubPendingRef.current = false;
        setFlow({ step: "done", review });
      })
      .catch((error: unknown) => {
        if (currentGenerationRef.current !== generation) {
          return;
        }
        if (
          isTRPCClientError<AppRouter>(error) &&
          error.data?.code === "NOT_FOUND"
        ) {
          restart(true);
          return;
        }
        scrubPendingRef.current = false;
        setFlow({ step: "scrub-failed", review });
      });
  };

  const restart = (isSourceMissing: boolean) => {
    // Old callbacks can run before React renders the reset.
    const nextGeneration = Symbol("workflow generation");
    currentGenerationRef.current = nextGeneration;
    setGeneration(nextGeneration);
    uploadClaimedRef.current = false;
    scrubPendingRef.current = false;
    upload.reset();
    inspection.reset();
    scrub.reset();
    setFlow({ step: "upload", isSourceMissing });
  };

  const renderStep = (
    settings: RouterOutputs["wizard"]["getWorkflowConfig"],
  ) => {
    if (flow.step === "upload") {
      return (
        <>
          <h2 key={flow.step} ref={focusWorkflowHeading} tabIndex={-1}>
            Upload PDF
          </h2>
          {flow.isSourceMissing ? (
            <output aria-label="PDF no longer available">
              The PDF is no longer available. Upload the PDF again.
            </output>
          ) : null}
          <FileUploader
            createUpload={upload.mutateAsync}
            maxFileSizeBytes={settings.maxFileSizeBytes}
            onUploadComplete={inspectFile}
          />
        </>
      );
    }
    if (flow.step === "inspecting") {
      return (
        <>
          <h2 key={flow.step} ref={focusWorkflowHeading} tabIndex={-1}>
            Inspect PDF
          </h2>
          <output aria-label="Inspecting PDF">
            Inspecting the PDF. Please wait.
          </output>
        </>
      );
    }
    if (flow.step === "inspection-failed") {
      return (
        <>
          <h2 key={flow.step} ref={focusWorkflowHeading} tabIndex={-1}>
            Could not inspect PDF
          </h2>
          <p role="alert">Could not inspect the PDF.</p>
        </>
      );
    }
    if (flow.step === "done") {
      return (
        <FileWorkflowResult
          headingRef={focusWorkflowHeading}
          review={flow.review}
        />
      );
    }
    return (
      <FileWorkflowReview
        fields={flow.review.fields}
        headingRef={focusWorkflowHeading}
        onScrub={() => {
          scrubFile(flow.review);
        }}
        step={flow.step}
      />
    );
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
      {config.isSuccess ? renderStep(config.data) : null}
      {flow.step === "upload" ? null : (
        <button
          className="btn"
          onClick={() => {
            restart(false);
          }}
          type="button"
        >
          Start again
        </button>
      )}
    </main>
  );
}
