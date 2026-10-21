import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import ky from "ky";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  FakeXMLHttpRequest,
  getFileInput,
  installXMLHttpRequestFake,
} from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
import type { BackendErrorResponse } from "#/domains/wizard/wizard-contracts.mod.server";
import { Route } from "#/routes/index";
import { NOT_FOUND_STATUS_CODE } from "#/shared/constants/http/status-codes/status-codes.mod";
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

vi.mock(import("#/shared/middlewares/app-bindings/app-bindings.mod"), () => ({
  getAppBindings: vi.fn(),
}));

const BROWSE_FILES_NAME = /browse files/iv;
const UPLOAD_FILE_NAME = /upload 1 file/iv;
const ONE_UPLOAD = 1;
const TWO_UPLOADS = 2;
const LAST_REQUEST_INDEX = -1;

afterEach(() => {
  FakeXMLHttpRequest.reset();
});

function setupHome() {
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
  const Home = Route.options.component;
  expect.assert(Home != null);
  const view = (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <StrictMode>
          <Home />
        </StrictMode>
      </TRPCProvider>
    </QueryClientProvider>
  );
  return { backend, queryClient, view };
}

test.each(["inspection", "scrub"] as const)(
  "%s missing source focuses upload, keeps an accessible notice, and accepts a fresh file",
  async (step) => {
    installXMLHttpRequestFake();
    const { backend, queryClient, view } = setupHome();
    const config: RouterOutputs["wizard"]["getWorkflowConfig"] = {
      maxFileSizeBytes: 4,
    };
    const oldUpload: RouterOutputs["wizard"]["createUpload"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000501",
      uploadUrl: "https://uploads.test/old-grant",
    };
    const oldReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fields: [
        {
          name: "Author",
          label: "Author",
          preview: "old-private-author",
          originalByteSize: 18,
          action: "remove",
        },
      ],
    };
    const missing: BackendErrorResponse = {
      error: "private-missing-source-detail",
    };
    const newInput: RouterInputs["wizard"]["createUpload"] = {
      fileName: "replacement.pdf",
      fileSizeBytes: 4,
    };
    const newUpload: RouterOutputs["wizard"]["createUpload"] = {
      storageKey: "uploads/00000000-0000-4000-8000-000000000502",
      uploadUrl: "https://uploads.test/new-grant",
    };
    const newReview: RouterOutputs["wizard"]["dryRun"] = {
      etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      fields: [],
    };
    const result: RouterOutputs["wizard"]["scrubFile"] = {
      status: "done",
      result: { downloadUrl: "https://downloads.test/new-result" },
    };
    const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
      downloadUrl: "https://downloads.test/new-verified-grant",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    backend
      .mockResolvedValueOnce(Response.json(config))
      .mockResolvedValueOnce(Response.json(oldUpload));
    if (step === "scrub") {
      backend.mockResolvedValueOnce(Response.json(oldReview));
    }
    backend.mockResolvedValueOnce(
      Response.json(missing, { status: NOT_FOUND_STATUS_CODE }),
    );
    const { user, unmount } = renderComponent(view);
    await screen.findByRole("button", { name: BROWSE_FILES_NAME });
    const oldFileInput = await getFileInput(user);
    await user.upload(
      oldFileInput,
      new File(["%PDF"], "old.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: UPLOAD_FILE_NAME }));
    await waitFor(() => {
      expect(FakeXMLHttpRequest.requests).toHaveLength(ONE_UPLOAD);
    });
    const [oldRequest] = FakeXMLHttpRequest.requests;
    expect.assert(oldRequest != null);
    await act(async () => {
      await oldRequest.respond({ status: 200 });
    });
    if (step === "scrub") {
      await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    }

    const notice = await screen.findByRole("status", {
      name: "PDF no longer available",
    });
    expect(notice).toHaveTextContent(
      "The PDF is no longer available. Upload the PDF again.",
    );
    expect(screen.getByRole("heading", { name: "Upload PDF" })).toHaveFocus();
    expect(screen.getByRole("main")).toContainElement(notice);
    expect(screen.getByRole("main")).toHaveClass("ph-no-capture");
    expect(
      screen.getByRole("button", { name: BROWSE_FILES_NAME }),
    ).toBeEnabled();
    expect(screen.queryByText("old.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("old-private-author")).not.toBeInTheDocument();
    expect(screen.queryByText(missing.error)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry scrub" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(Route.options.validateSearch).toBeUndefined();
    backend
      .mockResolvedValueOnce(Response.json(newUpload))
      .mockResolvedValueOnce(Response.json(newReview))
      .mockResolvedValueOnce(Response.json(result))
      .mockResolvedValueOnce(Response.json(grant));
    const newFileInput = await getFileInput(user);
    expect(newFileInput).not.toBe(oldFileInput);
    await user.upload(
      newFileInput,
      new File(["%PDF"], newInput.fileName, { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: UPLOAD_FILE_NAME }));
    await waitFor(() => {
      expect(FakeXMLHttpRequest.requests).toHaveLength(TWO_UPLOADS);
    });
    const newRequest = FakeXMLHttpRequest.requests.at(LAST_REQUEST_INDEX);
    expect.assert(newRequest != null);
    expect(newRequest.url).toBe(newUpload.uploadUrl);
    const [uploadRequest] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(uploadRequest != null);
    expect(await uploadRequest.json()).toEqual(newInput);
    await act(async () => {
      await newRequest.respond({ status: 200 });
    });
    await user.click(await screen.findByRole("button", { name: "Scrub it" }));
    expect(
      await screen.findByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", grant.downloadUrl);
    const [grantRequest] = backend.mock.calls.at(LAST_REQUEST_INDEX) ?? [];
    expect.assert(grantRequest != null);
    const reviewedPair: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey: newUpload.storageKey,
      etag: newReview.etag,
    };
    expect(await grantRequest.json()).toEqual(reviewedPair);
    expect(
      screen.queryByRole("status", { name: "PDF no longer available" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    unmount();
    queryClient.clear();
  },
);
