import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";

import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { CONFLICT_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { TRPCProvider } from "#/shared/libs/trpc/client/client.mod";
import { initializeTRPCClient } from "#/shared/libs/trpc/client/client-runtime.mod";
import { appRouter } from "#/shared/libs/trpc/routers/routers.mod.server";
import { createTRPCRequestContext } from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

import { FileWorkflowResult } from "./file-workflow-screens.mod";

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const RETENTION_TEXT =
  "Files expire after one day. Deletion usually follows within 24 hours after expiry, but it can take longer.";
const EXPIRY_EXPLANATION =
  "Download link expiry and file deletion are separate.";
const FOUR_REQUESTS = 4;

function setupResult(review: RouterInputs["wizard"]["refreshDownloadGrant"]) {
  const backend = vi.fn<(request: Request) => Promise<Response>>();
  const queryClient = new QueryClient();
  vi.mocked(getAppBindings).mockReturnValue({
    httpClient: ky.create(),
    posthogProjectToken: "phc_test_public_token",
    workflowHttpClient: ky.create({
      baseUrl: "https://backend.test/",
      retry: 0,
      hooks: { beforeRequest: [async ({ request }) => backend(request)] },
    }),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => createTRPCRequestContext(request),
      });
    }),
  );
  const trpcClient = initializeTRPCClient(
    new URL("https://frontend.test/api/trpc"),
  );
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <StrictMode>
          <FileWorkflowResult
            review={review}
            headingRef={(heading) => {
              heading?.focus();
            }}
          />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, queryClient, view };
}

test("result retention survives download, deletion pending, and deletion failure until confirmed removal", async () => {
  const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000901",
    etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/retention-grant",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const failure: BackendErrorResponse = { error: "private-delete-detail" };
  const deleted: RouterOutputs["wizard"]["confirmDelete"] = {
    status: "deleted",
  };
  const deletionResponse = Promise.withResolvers<Response>();
  const { backend, queryClient, view } = setupResult(review);
  backend
    .mockResolvedValueOnce(Response.json(grant))
    .mockReturnValueOnce(deletionResponse.promise)
    .mockResolvedValueOnce(Response.json(grant))
    .mockResolvedValueOnce(Response.json(deleted));
  const { user, unmount } = renderComponent(view);
  const download = await screen.findByRole("link", { name: "Download PDF" });
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  expect(screen.getByText(EXPIRY_EXPLANATION)).toBeVisible();
  download.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
    },
    { once: true },
  );
  await user.click(download);
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete files" })).toBeEnabled();
  expect(backend).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Delete files" }));
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(
    await screen.findByRole("status", { name: "Deleting files" }),
  ).toHaveTextContent("Waiting for the backend to confirm deletion.");
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Deletion confirmed" }),
  ).not.toBeInTheDocument();
  act(() => {
    deletionResponse.resolve(
      Response.json(failure, { status: CONFLICT_STATUS_CODE }),
    );
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not confirm deletion. Files may remain. Try again.",
  );
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  await screen.findByRole("link", { name: "Download PDF" });
  expect(screen.getByText(EXPIRY_EXPLANATION)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retry deletion" }));
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(
    await screen.findByRole("status", { name: "Deletion confirmed" }),
  ).toHaveTextContent("No stored files remained when the backend checked.");
  expect(screen.queryByText(RETENTION_TEXT)).not.toBeInTheDocument();
  expect(screen.queryByText(EXPIRY_EXPLANATION)).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledTimes(FOUR_REQUESTS);
  expect(
    backend.mock.calls.map(([request]) => new URL(request.url).pathname),
  ).toEqual([
    "/api/files/download-grant",
    "/api/files/delete",
    "/api/files/download-grant",
    "/api/files/delete",
  ]);
  unmount();
  queryClient.clear();
});

test("an expired grant keeps lifecycle retention and does not claim or request deletion", async () => {
  const review: RouterInputs["wizard"]["refreshDownloadGrant"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000902",
    etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const expired: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/expired-retention-grant",
    expiresAt: "2000-01-01T00:00:00Z",
  };
  const { backend, queryClient, view } = setupResult(review);
  backend.mockResolvedValueOnce(Response.json(expired));
  const { unmount } = renderComponent(view);
  expect(
    await screen.findByRole("status", { name: "Download link expired" }),
  ).toHaveTextContent(
    "The download link has expired. Refresh it to download the PDF.",
  );
  expect(screen.getByText(RETENTION_TEXT)).toBeVisible();
  expect(screen.getByText(EXPIRY_EXPLANATION)).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete files" })).toBeEnabled();
  expect(
    screen.queryByRole("heading", { name: "Deletion confirmed" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(backend).toHaveBeenCalledOnce();
  expect(
    backend.mock.calls.map(([request]) => new URL(request.url).pathname),
  ).toEqual(["/api/files/download-grant"]);
  unmount();
  queryClient.clear();
});
