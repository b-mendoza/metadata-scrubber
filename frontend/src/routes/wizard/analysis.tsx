import { createFileRoute, Link } from "@tanstack/react-router";
import * as z from "zod";

import { WizardShell } from "#/domains/wizard/components/wizard-shell/wizard-shell.mod";
import { SIGNED_URL_EXPIRATION_MILLIS } from "#/domains/wizard/constants/wizard.mod";

const analysisSearchParamsSchema = z.object({
  sessionId: z.uuidv4(),
});

export const Route = createFileRoute("/wizard/analysis")({
  component: RouteComponent,
  validateSearch: analysisSearchParamsSchema,
  loaderDeps(opts) {
    const { sessionId } = opts.search;

    return {
      sessionId,
    };
  },
  loader(ctx) {
    const { queryClient, trpc } = ctx.context;

    const { sessionId } = ctx.deps;

    // Prefetch documents for backward navigation to categorization
    queryClient
      .prefetchQuery(
        trpc.wizard.getDocumentsBySession.queryOptions(
          {
            sessionId,
          },
          {
            refetchInterval: SIGNED_URL_EXPIRATION_MILLIS,
            staleTime: SIGNED_URL_EXPIRATION_MILLIS,
          },
        ),
      )
      .catch((error) => {
        // oxlint-disable-next-line no-console -- Background prefetch should not block render, but failures must be observable.
        console.error(error);
      });

    return null;
  },
  head() {
    return {
      meta: [
        {
          title: "Document Analysis | Spend Guard",
        },
      ],
    };
  },
});

const STEP_TITLE = "Analyze Documents";

const STEP_DESCRIPTION =
  "Analysis step placeholder - Analysis results UI will go here";

function RouteComponent() {
  const sessionId = Route.useSearch({
    select: (searchParams) => searchParams.sessionId,
  });

  return (
    <WizardShell navigation={<AnalysisStepNavigation />} stepTitle={STEP_TITLE}>
      <p className="text-base-content/70">{STEP_DESCRIPTION}</p>

      <p className="text-base-content/50 mt-2 text-sm">
        Session ID: {sessionId}
      </p>
    </WizardShell>
  );
}

function AnalysisStepNavigation() {
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
        to="/wizard/categorization"
      >
        Previous
      </Link>

      <Link className="link aria-disabled:cursor-not-allowed" disabled to=".">
        Complete
      </Link>
    </>
  );
}
