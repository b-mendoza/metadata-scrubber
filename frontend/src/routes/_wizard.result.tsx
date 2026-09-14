import { QueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  SearchParamError,
} from "@tanstack/react-router";
import { isTRPCClientError } from "@trpc/client";
import type { TRPCError } from "@trpc/server";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { ResultAsync } from "neverthrow";
import * as z from "zod";

import { WizardResult } from "#/domains/wizard/components/wizard/wizard-result.mod";
import {
  canonicalETagSchema,
  storageKeySchema,
} from "#/domains/wizard/wizard-identifiers.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

const searchSchema = z.strictObject({
  storageKey: storageKeySchema,
  etag: canonicalETagSchema,
});
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
export const Route = createFileRoute("/_wizard/result")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  gcTime: 0,
  staleTime: 0,
  shouldReload: true,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => <p role="status">Loading download…</p>,
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
  loader: loadResult,
  component: ResultRoute,
});
export async function loadResult({
  context: { trpc },
  deps,
  abortController,
}: {
  context: { trpc: TRPCOptionsProxy<AppRouter> };
  deps: z.infer<typeof searchSchema>;
  abortController: AbortController;
}) {
  abortController.signal.throwIfAborted();
  const queryClient = new QueryClient();
  queryClient.mount();
  const cancel = () => {
    void queryClient.cancelQueries();
  };
  abortController.signal.addEventListener("abort", cancel, { once: true });
  try {
    const responseResult = await ResultAsync.fromPromise(
      queryClient.query(
        trpc.wizard.refreshDownloadGrant.queryOptions(deps, {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          trpc: { abortOnUnmount: true },
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
    return { revision: deps, grant: response };
  } finally {
    abortController.signal.removeEventListener("abort", cancel);
    queryClient.clear();
    queryClient.unmount();
  }
}
function ResultRoute() {
  const data = Route.useLoaderData();
  const { trpc, queryClient } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (data == null) return null;
  return (
    <WizardResult
      key={`${data.revision.storageKey}:${data.revision.etag}`}
      revision={data.revision}
      initialDownloadUrl={data.grant.downloadUrl}
      initialExpiresAt={data.grant.expiresAt}
      trpc={trpc}
      queryClient={queryClient}
      onRestart={() => {
        void navigate({ to: "/", replace: true });
      }}
    />
  );
}
