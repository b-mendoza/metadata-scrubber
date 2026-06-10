import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { Image } from "@unpic/react";
import { Suspense } from "react";
import * as z from "zod";

import { WizardShell } from "#/domains/wizard/components/wizard-shell/wizard-shell.mod";
import { SIGNED_URL_EXPIRATION_MILLIS } from "#/domains/wizard/constants/wizard.mod";
import { Spinner } from "#/shared/components/spinner/spinner.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

const categorizationSearchParamsSchema = z.object({
  sessionId: z.uuidv4(),
});

export const Route = createFileRoute("/wizard/categorization")({
  component: RouteComponent,
  validateSearch: categorizationSearchParamsSchema,
  head() {
    return {
      meta: [
        {
          title: "Categorize Documents | Spend Guard",
        },
      ],
    };
  },
  loaderDeps(opts) {
    const { sessionId } = opts.search;

    return {
      sessionId,
    };
  },
  loader(ctx) {
    const { queryClient, trpc } = ctx.context;

    const { sessionId } = ctx.deps;

    queryClient
      .prefetchQuery(getDocumentsBySessionQueryOptions(trpc, sessionId))
      .catch((error) => {
        // oxlint-disable-next-line no-console -- Background prefetch should not block render, but failures must be observable.
        console.error(error);
      });

    return null;
  },
});

const STEP_TITLE = "Categorize Documents";

const STEP_DESCRIPTION =
  "Categorization step placeholder - Category assignment UI will go here";

function getDocumentsBySessionQueryOptions(
  trpc: TRPCOptionsProxy<AppRouter>,
  sessionId: string,
) {
  return trpc.wizard.getDocumentsBySession.queryOptions(
    {
      sessionId,
    },
    {
      refetchInterval: SIGNED_URL_EXPIRATION_MILLIS,
      staleTime: SIGNED_URL_EXPIRATION_MILLIS,
    },
  );
}

function RouteComponent() {
  return (
    <WizardShell
      navigation={<CategorizationStepNavigation />}
      stepTitle={STEP_TITLE}
    >
      <p className="text-base-content/70">{STEP_DESCRIPTION}</p>

      <Suspense fallback={<Spinner />}>
        <FileList />
      </Suspense>

      <Suspense fallback={<Spinner />}>
        <FilesCount />
      </Suspense>
    </WizardShell>
  );
}

function CategorizationStepNavigation() {
  const sessionId = Route.useSearch({
    select: (searchParams) => searchParams.sessionId,
  });

  return (
    <>
      <Link
        className="link"
        search={{
          sessionId,
        }}
        to="/wizard/upload"
      >
        Previous
      </Link>

      <Link
        className="link"
        search={{
          sessionId,
        }}
        to="/wizard/analysis"
      >
        Next
      </Link>
    </>
  );
}

function FileList() {
  const sessionId = Route.useSearch({
    select: (searchParams) => searchParams.sessionId,
  });

  const { trpc } = Route.useRouteContext();

  const getDocumentsBySessionQueryResult = useSuspenseQuery(
    getDocumentsBySessionQueryOptions(trpc, sessionId),
  );

  const files = getDocumentsBySessionQueryResult.data.documents;

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <li key={file.id} className="bg-base-200 rounded-box overflow-hidden">
          {file.mimeType.startsWith("image/") ? (
            <Image
              // TODO: Add cdn="cloudflare" once we have:
              // - A domain/hosted zone in the Cloudflare account
              // - Image Transformations enabled
              alt={file.fileName}
              className="aspect-video"
              src={file.cdnUrl}
              layout="fixed"
              width={300}
              height={300}
              objectFit="cover"
            />
          ) : (
            <div className="bg-base-300 flex aspect-video items-center justify-center">
              <span className="text-base-content/50 text-sm">PDF</span>
            </div>
          )}

          <div className="p-3">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <p className="text-base-content/50 text-xs">
              {file.mimeType} &middot; {file.fileSizeBytes} bytes
            </p>

            <Link
              className="link"
              to={file.cdnUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FilesCount() {
  const sessionId = Route.useSearch({
    select: (searchParams) => searchParams.sessionId,
  });

  const { trpc } = Route.useRouteContext();

  const getDocumentsBySessionQueryResult = useSuspenseQuery(
    getDocumentsBySessionQueryOptions(trpc, sessionId),
  );

  const filesCount = getDocumentsBySessionQueryResult.data.documents.length;

  return (
    <p className="text-base-content/50 mt-2 text-sm">
      Files to categorize: {filesCount}
    </p>
  );
}
