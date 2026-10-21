import type { Ref } from "react";

import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";

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
  downloadUrl: string;
  headingRef: Ref<HTMLHeadingElement>;
}

export function FileWorkflowResult({
  downloadUrl,
  headingRef,
}: Readonly<FileWorkflowResultProps>) {
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1}>
        PDF ready
      </h2>
      <a
        className="btn btn-primary"
        href={downloadUrl}
        referrerPolicy="no-referrer"
      >
        Download PDF
      </a>
      <p>The download link lasts about 15 minutes.</p>
    </>
  );
}
