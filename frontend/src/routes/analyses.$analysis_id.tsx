import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Suspense, use } from "react";
import * as z from "zod";

import type { AnalysisStatus } from "#/domains/file-uploader/routers/file-uploader-router.mod.server";
import { Button } from "#/shared/components/button/button.mod";
import type { CleanInvoice } from "#/shared/libs/azure/content-understanding/schemas.mod.server";
import {
  invoiceAnalysisSchema,
  transformToCleanInvoice,
} from "#/shared/libs/azure/content-understanding/schemas.mod.server";

const validateAnalysisResultInputsSchema = z.object({
  fields: z.record(z.string().trim(), z.unknown()),
});

const validateAnalysisResultServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(validateAnalysisResultInputsSchema)
  .handler((ctx) => {
    const { fields } = ctx.data;

    const validatedInvoiceAnalysisResult = invoiceAnalysisSchema.parse(fields);

    return {
      invoiceAnalysis: transformToCleanInvoice(validatedInvoiceAnalysisResult),
    };
  });

export const Route = createFileRoute("/analyses/$analysis_id")({
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
  async loader(ctx) {
    const { queryClient, trpc } = ctx.context;

    const { analysis_id: analysisId } = ctx.params;

    try {
      await queryClient.ensureQueryData(
        trpc.fileUploader.getAnalysisResult.queryOptions({
          analysisId,
        }),
      );
    } catch (error) {
      if (error instanceof Error) {
        throw notFound();
      }

      throw new TypeError(
        "Unexpected non-error while loading analysis result",
        {
          cause: error,
        },
      );
    }

    return null;
  },
});

const AnalysisResultFallback = () => <div>Loading analysis result...</div>;

function RouteComponent() {
  const analysisId = Route.useParams({
    select: (params) => params.analysis_id,
  });

  return (
    <div className="flex flex-col gap-2">
      <Suspense fallback={<AnalysisResultFallback />}>
        <Analysis analysisId={analysisId} />
      </Suspense>

      <Link to="/">Go back to home page</Link>

      <BoundingBoxQuerier analysisId={analysisId} />
    </div>
  );
}

const ANALYSIS_STATUS_CLASSNAMES: Record<AnalysisStatus, string> = {
  Canceled: "text-amber-600",
  Failed: "text-red-600",
  NotStarted: "text-gray-600",
  Running: "text-blue-600",
  Succeeded: "text-emerald-600",
};

interface AnalysisProps {
  analysisId: string;
}

interface AnalysisStatusRefetchButtonProps {
  isFetching: boolean;
  onPress: () => void;
}

const AnalysisStatusRefetchButton = (
  props: AnalysisStatusRefetchButtonProps,
) => {
  const { isFetching, onPress } = props;

  const buttonText = isFetching
    ? "Checking analysis status..."
    : "Check analysis status";

  return (
    <Button isPending={isFetching} onPress={onPress}>
      {buttonText}
    </Button>
  );
};

const Analysis = (props: AnalysisProps) => {
  const { analysisId } = props;

  const { trpc } = Route.useRouteContext();

  const getAnalysisResultQueryResult = useSuspenseQuery(
    trpc.fileUploader.getAnalysisResult.queryOptions({
      analysisId,
    }),
  );

  const isRefetchingAnalysisStatus = getAnalysisResultQueryResult.isFetching;

  const handleRefetchAnalysisStatus = () => {
    getAnalysisResultQueryResult.refetch().catch((error) => {
      // oxlint-disable-next-line no-console -- Manual refetch is intentionally fire-and-forget, but failures must be observable.
      console.error(error);
    });
  };

  if (getAnalysisResultQueryResult.isError) {
    return (
      <>
        <p>The analysis failed. Please try again later.</p>

        <AnalysisStatusRefetchButton
          isFetching={isRefetchingAnalysisStatus}
          onPress={handleRefetchAnalysisStatus}
        />
      </>
    );
  }

  return (
    <>
      <p>
        The analysis result is:{" "}
        <span
          className={
            ANALYSIS_STATUS_CLASSNAMES[getAnalysisResultQueryResult.data.status]
          }
        >
          {getAnalysisResultQueryResult.data.status}
        </span>
      </p>

      <AnalysisStatusRefetchButton
        isFetching={isRefetchingAnalysisStatus}
        onPress={handleRefetchAnalysisStatus}
      />
    </>
  );
};

const ValidatingAnalysisResultFallback = () => (
  <div>Validating analysis result...</div>
);

interface BoundingBoxQuerierProps {
  analysisId: string;
}

const BoundingBoxQuerier = (props: BoundingBoxQuerierProps) => {
  const { analysisId } = props;

  const { trpc } = Route.useRouteContext();

  const getAnalysisResultQueryResult = useSuspenseQuery(
    trpc.fileUploader.getAnalysisResult.queryOptions({
      analysisId,
    }),
  );

  const validateAnalysisResult = useServerFn(validateAnalysisResultServerFn);

  const analysisResult = getAnalysisResultQueryResult.data.result;

  const [analysisContent] = analysisResult.contents;

  const analysisFields = analysisContent?.fields;

  if (analysisFields == null) return null;

  const validatedAnalysisResultPromise = validateAnalysisResult({
    data: {
      fields: analysisFields,
    },
  });

  return (
    <Suspense fallback={<ValidatingAnalysisResultFallback />}>
      <BoundingBox
        validatedAnalysisResultPromise={validatedAnalysisResultPromise}
      />
    </Suspense>
  );
};

const JSON_INDENT_SIZE = 2;

interface BoundingBoxProps {
  validatedAnalysisResultPromise: Promise<{
    invoiceAnalysis: CleanInvoice;
  }>;
}

const BoundingBox = (props: BoundingBoxProps) => {
  const { validatedAnalysisResultPromise } = props;

  // TODO: Implement multi-page analysis result validation

  const { invoiceAnalysis } = use(validatedAnalysisResultPromise);

  return <pre>{JSON.stringify(invoiceAnalysis, null, JSON_INDENT_SIZE)}</pre>;
};

function NotFoundComponent() {
  return (
    <div className="flex flex-col gap-2">
      <p>We were unable to find the analysis result. Please try again later.</p>

      <Link to="/">Go back to home page</Link>
    </div>
  );
}
