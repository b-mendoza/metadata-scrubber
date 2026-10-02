import { useMutation } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useEffect, useRef } from "react";

import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface WizardReviewProps {
  revision: RouterInputs["wizard"]["scrubFile"];
  fields: RouterOutputs["wizard"]["dryRun"]["fields"];
  trpc: TRPCOptionsProxy<AppRouter>;
  onComplete: () => void;
  onFailure: (error: unknown) => void;
}
const INITIAL_GENERATION = 0;
const GENERATION_INCREMENT = 1;
const useScrubSessionGeneration = () => {
  const generationRef = useRef(INITIAL_GENERATION);
  useEffect(
    () => () => {
      generationRef.current += GENERATION_INCREMENT;
    },
    [],
  );
  return generationRef;
};
export function WizardReview({
  revision,
  fields,
  trpc,
  onComplete,
  onFailure,
}: Readonly<WizardReviewProps>) {
  const generationRef = useScrubSessionGeneration();
  const scrubStartedRef = useRef(false);
  const scrub = useMutation(
    trpc.wizard.scrubFile.mutationOptions({ retry: false }),
  );
  const scrubFile = async () => {
    if (scrubStartedRef.current) return;
    scrubStartedRef.current = true;
    const { current } = generationRef;
    try {
      await scrub.mutateAsync(revision);
      if (current !== generationRef.current) return;
      onComplete();
    } catch (error: unknown) {
      if (current !== generationRef.current) return;
      onFailure(error);
    }
  };
  return (
    <section className="space-y-4">
      <h2 className="text-2xl">Review metadata</h2>
      <p>
        Previews can omit content. A shortened preview is not the complete
        original value.
      </p>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Metadata</th>
              <th>Preview</th>
              <th>Original bytes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name}>
                <th scope="row">{field.label}</th>
                <td>
                  {field.preview}
                  {new TextEncoder().encode(field.preview).byteLength <
                    field.originalByteSize && <p>Shortened preview</p>}
                </td>
                <td>{field.originalByteSize}</td>
                <td>
                  {field.action === "remove" ? "Remove" : "Neutral replacement"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div role="group" aria-label="Scrub actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={scrub.isPending}
          onClick={() => {
            void scrubFile();
          }}
        >
          Scrub it
        </button>
        <p>Files are automatically deleted within up to 48 hours.</p>
      </div>
      {scrub.isPending && <p role="status">Scrubbing PDF…</p>}
    </section>
  );
}
