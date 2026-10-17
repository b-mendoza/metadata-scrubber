import type { Ref } from "react";

import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";

const RETENTION =
  "Files expire after one day. Deletion usually occurs within 24 hours after expiry, but it can take longer.";

interface FileWorkflowReviewProps {
  fields: RouterOutputs["wizard"]["dryRun"]["fields"];
  step: "review" | "scrubbing" | "scrub-failed";
  headingRef: Ref<HTMLHeadingElement>;
  onScrub: () => void;
  onRestart: () => void;
}

export function FileWorkflowReview({
  fields,
  step,
  headingRef,
  onScrub,
  onRestart,
}: Readonly<FileWorkflowReviewProps>) {
  const scrubAction = step === "scrub-failed" ? "Retry scrub" : "Scrub it";

  return (
    <>
      <h2 ref={headingRef} tabIndex={-1}>
        Review metadata
      </h2>
      <p>
        Review the supported identifying metadata below. This does not cover all
        hidden PDF content.
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
        <p role="alert">Could not scrub the PDF. Try again or start again.</p>
      ) : null}
      <button
        className="btn btn-primary"
        disabled={step === "scrubbing"}
        onClick={onScrub}
        type="button"
      >
        {scrubAction}
      </button>
      <p>{RETENTION}</p>
      {step === "scrubbing" ? (
        <output aria-label="Scrubbing PDF">
          Scrubbing the PDF. Please wait.
        </output>
      ) : (
        <button className="btn" onClick={onRestart} type="button">
          Start again
        </button>
      )}
    </>
  );
}

interface FileWorkflowOutcomeProps {
  outcome:
    | { step: "clean" | "signed" | "conflict" | "inspection-failed" }
    | { step: "done"; downloadUrl: string };
  headingRef: Ref<HTMLHeadingElement>;
  onRestart: () => void;
}

export function FileWorkflowOutcome({
  outcome,
  headingRef,
  onRestart,
}: Readonly<FileWorkflowOutcomeProps>) {
  return (
    <>
      {outcome.step === "done" ? (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            PDF ready
          </h2>
          <a
            className="btn btn-primary"
            href={outcome.downloadUrl}
            referrerPolicy="no-referrer"
          >
            Download PDF
          </a>
          <p>The download link lasts about 15 minutes.</p>
        </>
      ) : null}
      {outcome.step === "clean" ? (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            Already clean
          </h2>
          <p>No supported identifying metadata needs removal.</p>
          <p>{RETENTION}</p>
        </>
      ) : null}
      {outcome.step === "signed" ? (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            Signed PDF not supported
          </h2>
          <p>
            This version does not support signed PDFs. Removing metadata can
            invalidate a digital signature.
          </p>
          <p>{RETENTION}</p>
        </>
      ) : null}
      {outcome.step === "conflict" ? (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            PDF changed
          </h2>
          <p role="alert">Start again to review the current PDF.</p>
        </>
      ) : null}
      {outcome.step === "inspection-failed" ? (
        <>
          <h2 ref={headingRef} tabIndex={-1}>
            Could not inspect PDF
          </h2>
          <p role="alert">
            Could not inspect the PDF. Start again to upload a supported PDF.
          </p>
        </>
      ) : null}
      <button className="btn" onClick={onRestart} type="button">
        Start again
      </button>
    </>
  );
}
