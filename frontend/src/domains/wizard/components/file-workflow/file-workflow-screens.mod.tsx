import type { Ref } from "react";

import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";

interface FileWorkflowReviewProps {
  fields: RouterOutputs["wizard"]["dryRun"]["fields"];
  headingRef: Ref<HTMLHeadingElement>;
}

export function FileWorkflowReview({
  fields,
  headingRef,
}: Readonly<FileWorkflowReviewProps>) {
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
      <p>
        Files expire after one day. Deletion usually follows within 24 hours
        after expiry, but it can take longer.
      </p>
    </>
  );
}
