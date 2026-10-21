import type { Ref } from "react";

import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";

import {
  FileWorkflowDeletion,
  useConfirmedDeletion,
} from "./file-workflow-deletion.mod";
import { useDownloadGrant } from "./file-workflow-download.mod";

interface FileWorkflowReviewProps {
  fields: RouterOutputs["wizard"]["dryRun"]["fields"];
  headingRef: Ref<HTMLHeadingElement>;
  onScrub: () => void;
  step: "review" | "scrubbing" | "scrub-failed";
}

export function FileWorkflowReview({
  fields,
  headingRef,
  onScrub,
  step,
}: Readonly<FileWorkflowReviewProps>) {
  const scrubAction = step === "scrub-failed" ? "Retry scrub" : "Scrub it";

  return (
    <>
      <h2 key={step} ref={headingRef} tabIndex={-1}>
        Review metadata
      </h2>
      <p>
        Review the supported identifying metadata below. Metadata removal is
        limited to Info, XMP, and custom metadata. This does not cover all
        hidden PDF content or make the PDF safe to share.
      </p>
      <p>
        Previews can be shortened. The byte count describes the original value.
      </p>
      <p>A neutral replacement does not remove the field.</p>
      <ul>
        {fields.map((field) => (
          <li key={field.name}>
            <dl>
              <dt>Field</dt>
              <dd>{field.name}</dd>
              <dt>Label</dt>
              <dd>{field.label}</dd>
              <dt>Preview</dt>
              <dd>{field.preview}</dd>
              <dt>Original size</dt>
              <dd>{field.originalByteSize} bytes</dd>
              <dt>Action</dt>
              <dd>
                {field.action === "remove"
                  ? "Remove"
                  : "Replace with a neutral value"}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      {step === "scrub-failed" ? (
        <p role="alert">Could not scrub the PDF. Try again.</p>
      ) : null}
      <button
        className="btn btn-primary"
        disabled={step === "scrubbing"}
        onClick={onScrub}
        type="button"
      >
        {scrubAction}
      </button>
      <p>
        Files expire after one day. Deletion usually follows within 24 hours
        after expiry, but it can take longer.
      </p>
      {step === "scrubbing" ? (
        <output aria-label="Scrubbing PDF">
          Scrubbing the PDF. Please wait.
        </output>
      ) : null}
    </>
  );
}

interface FileWorkflowResultProps {
  review: RouterInputs["wizard"]["refreshDownloadGrant"];
  headingRef: Ref<HTMLHeadingElement>;
}

function FileWorkflowDownload({
  review,
}: Readonly<Pick<FileWorkflowResultProps, "review">>) {
  const { state, refresh, onDownload } = useDownloadGrant(review);
  const canRefresh = ["expired", "failed", "missing"].includes(state.status);
  return (
    <>
      {state.status === "ready" ? (
        <a
          className="btn btn-primary"
          href={state.grant.downloadUrl}
          onClick={onDownload}
          referrerPolicy="no-referrer"
        >
          Download PDF
        </a>
      ) : (
        <button className="btn btn-primary" disabled type="button">
          Download PDF
        </button>
      )}
      {state.status === "checking" ? (
        <output aria-label="Checking download link">
          Checking the download link. Please wait.
        </output>
      ) : null}
      {state.status === "expired" ? (
        <output aria-label="Download link expired">
          The download link has expired. Refresh it to download the PDF.
        </output>
      ) : null}
      {state.status === "failed" ? (
        <p role="alert">Could not refresh the download link. Try again.</p>
      ) : null}
      {state.status === "missing" ? (
        <p role="alert">
          The result is no longer available. Refresh the link or start again.
        </p>
      ) : null}
      {canRefresh ? (
        <button className="btn" onClick={refresh} type="button">
          Refresh download link
        </button>
      ) : null}
      <p>Download link expiry and file deletion are separate.</p>
    </>
  );
}

export function FileWorkflowResult({
  review,
  headingRef,
}: Readonly<FileWorkflowResultProps>) {
  const deletion = useConfirmedDeletion(review.storageKey);
  if (deletion.phase === "deleted") {
    return (
      <>
        <h2 key="deleted" ref={headingRef} tabIndex={-1}>
          Deletion confirmed
        </h2>
        <output aria-label="Deletion confirmed">
          No stored files remained when the backend checked.
        </output>
        <button className="btn btn-primary" disabled type="button">
          Download PDF
        </button>
      </>
    );
  }
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1}>
        PDF ready
      </h2>
      <p>
        Producer, CreationDate, and ModDate can have neutral replacements. A
        neutral replacement does not remove the field.
      </p>
      {deletion.phase === "deleting" ? (
        <button className="btn btn-primary" disabled type="button">
          Download PDF
        </button>
      ) : (
        <FileWorkflowDownload review={review} />
      )}
      <p>
        Files expire after one day. Deletion usually follows within 24 hours
        after expiry, but it can take longer.
      </p>
      <FileWorkflowDeletion deletion={deletion} />
    </>
  );
}
