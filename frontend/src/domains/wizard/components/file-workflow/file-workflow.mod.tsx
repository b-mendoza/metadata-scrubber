// eslint-disable-next-line no-restricted-imports -- Local settings recovery keeps the uploader unmounted until the user retries.
import { useMutation, useQuery } from "@tanstack/react-query";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

const focusUploadHeading = (heading: HTMLHeadingElement | null) => {
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
      {config.isSuccess ? (
        <>
          <h2 ref={focusUploadHeading} tabIndex={-1}>
            Upload PDF
          </h2>
          <FileUploader
            createUpload={upload.mutateAsync}
            maxFileSizeBytes={config.data.maxFileSizeBytes}
            onUploadComplete={() => {
              // shortcut: completion stays in the Dashboard, replace when inspection is added.
            }}
          />
        </>
      ) : null}
    </main>
  );
}
