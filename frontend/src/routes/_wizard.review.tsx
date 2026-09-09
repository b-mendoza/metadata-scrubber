import {
  createFileRoute,
  redirect,
  SearchParamError,
} from "@tanstack/react-router";
import { isTRPCClientError } from "@trpc/client";
import type { TRPCError } from "@trpc/server";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import { WizardReview } from "#/domains/wizard/components/wizard/wizard-review.mod";
import { storageKeySchema } from "#/domains/wizard/wizard-identifiers.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

const searchSchema = z.strictObject({ storageKey: storageKeySchema });
const FAILURE_KINDS = new Map<
  TRPCError["code"],
  "missing-source" | "conflict" | "signed"
>([
  ["NOT_FOUND", "missing-source"],
  ["CONFLICT", "conflict"],
  ["UNPROCESSABLE_CONTENT", "signed"],
]);
const serverErrorSchema = z.object({
  code: z.enum(["NOT_FOUND", "CONFLICT", "UNPROCESSABLE_CONTENT"]),
});
const EMPTY_FIELD_COUNT = 0;
export const Route = createFileRoute("/_wizard/review")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  gcTime: 0,
  staleTime: 0,
  shouldReload: true,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => <p role="status">Inspecting PDF…</p>,
  onError: (error) => {
    if (error instanceof SearchParamError) {
      redirect({ throw: true, to: "/", replace: true });
    }
  },
  errorComponent: () => (
    <p role="alert">
      Could not complete the PDF operation. Start a new upload.
    </p>
  ),
  loader: async ({ context: { queryClient, trpc }, deps, abortController }) => {
    const responseResult = await ResultAsync.fromPromise(
      queryClient.query(
        trpc.wizard.dryRun.queryOptions(deps, {
          retry: false,
          staleTime: 0,
          gcTime: 0,
        }),
      ),
      (error: unknown) => error,
    );
    if (responseResult.isErr()) {
      const { error } = responseResult;
      abortController.signal.throwIfAborted();
      const serverError = serverErrorSchema.safeParse(error);
      const code = isTRPCClientError<AppRouter>(error)
        ? error.data?.code
        : serverError.data?.code;
      const kind =
        FAILURE_KINDS.get(code ?? "INTERNAL_SERVER_ERROR") ?? "error";
      redirect({
        throw: true,
        to: "/outcome",
        search: { kind },
        replace: true,
      });
      return;
    }
    abortController.signal.throwIfAborted();
    const response = responseResult.value;
    if (response.fields.length === EMPTY_FIELD_COUNT) {
      redirect({
        throw: true,
        to: "/outcome",
        search: { kind: "clean" },
        replace: true,
      });
      return;
    }
    return {
      revision: { storageKey: deps.storageKey, etag: response.etag },
      fields: response.fields,
    };
  },
  component: ReviewRoute,
});
function ReviewRoute() {
  const data = Route.useLoaderData();
  const { trpc } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (data == null) return null;
  return (
    <WizardReview
      key={`${data.revision.storageKey}:${data.revision.etag}`}
      {...data}
      trpc={trpc}
      onComplete={() => {
        void navigate({ to: "/result", search: data.revision, replace: true });
      }}
      onFailure={(error) => {
        const code = isTRPCClientError<AppRouter>(error)
          ? error.data?.code
          : null;
        const kind =
          FAILURE_KINDS.get(code ?? "INTERNAL_SERVER_ERROR") ?? "error";
        void navigate({ to: "/outcome", search: { kind }, replace: true });
      }}
    />
  );
}
