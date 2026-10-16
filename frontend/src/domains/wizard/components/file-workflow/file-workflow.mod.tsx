// eslint-disable-next-line no-restricted-imports -- Local config recovery keeps the uploader unmounted without adding an error-boundary component.
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { useEffect, useRef, useState } from "react";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

import {
  FileWorkflowOutcome,
  FileWorkflowReview,
} from "./file-workflow-screens.mod";

type ReviewedPDF = RouterInputs["wizard"]["dryRun"] &
  RouterOutputs["wizard"]["dryRun"];
type Flow =
  | { step: "upload" }
  | { step: "inspecting" }
  | { step: "clean" | "signed" | "conflict" | "inspection-failed" }
  | { step: "review" | "scrubbing" | "scrub-failed"; review: ReviewedPDF }
  | { step: "done"; downloadUrl: string };

const NO_METADATA_FIELDS = 0;

function useStepFocus(step: string) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  return headingRef;
}

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
  const [flow, setFlow] = useState<Flow>({ step: "upload" });
  const [missingNotice, setMissingNotice] = useState(false);
  const uploadClaimedRef = useRef(false);
  const scrubPendingRef = useRef(false);
  const headingRef = useStepFocus(`${config.status}:${flow.step}`);

  const inspectFile = (input: RouterInputs["wizard"]["dryRun"]) => {
    if (uploadClaimedRef.current) {
      return;
    }
    uploadClaimedRef.current = true;
    setMissingNotice(false);
    setFlow({ step: "inspecting" });
    void inspection
      .mutateAsync(input)
      .then((result) => {
        if (result.fields.length === NO_METADATA_FIELDS) {
          setFlow({ step: "clean" });
          return;
        }
        setFlow({ step: "review", review: { ...input, ...result } });
      })
      .catch((error: unknown) => {
        const code = isTRPCClientError<AppRouter>(error)
          ? error.data?.code
          : null;
        if (code === "NOT_FOUND") {
          uploadClaimedRef.current = false;
          upload.reset();
          inspection.reset();
          scrub.reset();
          setMissingNotice(true);
          setFlow({ step: "upload" });
        } else if (code === "UNPROCESSABLE_CONTENT") {
          setFlow({ step: "signed" });
        } else {
          setFlow({ step: "inspection-failed" });
        }
      });
  };

  const scrubFile = (review: ReviewedPDF) => {
    if (scrubPendingRef.current) {
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
      .then((result) => {
        scrubPendingRef.current = false;
        setFlow({ step: "done", downloadUrl: result.result.downloadUrl });
      })
      .catch((error: unknown) => {
        scrubPendingRef.current = false;
        const code = isTRPCClientError<AppRouter>(error)
          ? error.data?.code
          : null;
        if (code === "NOT_FOUND") {
          uploadClaimedRef.current = false;
          upload.reset();
          inspection.reset();
          scrub.reset();
          setMissingNotice(true);
          setFlow({ step: "upload" });
        } else if (code === "CONFLICT") {
          setFlow({ step: "conflict" });
        } else if (code === "UNPROCESSABLE_CONTENT") {
          setFlow({ step: "signed" });
        } else {
          setFlow({ step: "scrub-failed", review });
        }
      });
  };

  const restart = () => {
    uploadClaimedRef.current = false;
    scrubPendingRef.current = false;
    upload.reset();
    inspection.reset();
    scrub.reset();
    setMissingNotice(false);
    setFlow({ step: "upload" });
  };

  const renderStep = (
    settings: RouterOutputs["wizard"]["getWorkflowConfig"],
  ) => {
    if (flow.step === "upload") {
      return (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            Upload PDF
          </h2>
          {missingNotice ? (
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
          <h2 ref={headingRef} tabIndex={-1}>
            Inspect PDF
          </h2>
          <output aria-label="Inspecting PDF">
            Inspecting the PDF. Please wait.
          </output>
        </>
      );
    }
    if ("review" in flow) {
      return (
        <FileWorkflowReview
          fields={flow.review.fields}
          headingRef={headingRef}
          onRestart={restart}
          onScrub={() => {
            scrubFile(flow.review);
          }}
          step={flow.step}
        />
      );
    }
    return (
      <FileWorkflowOutcome
        headingRef={headingRef}
        onRestart={restart}
        outcome={flow}
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
    </main>
  );
}
