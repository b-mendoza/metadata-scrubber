import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import { createTestTRPCClient } from "#/domains/wizard/components/wizard/wizard.test-helper";
import { WizardResult } from "#/domains/wizard/components/wizard/wizard-result.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const FLUSH_MS = 0;
const GRANT_LIFETIME_MS = 120_000;
const { request, client } = createTestTRPCClient();
beforeEach(() => {
  request.mockReset();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
});
test("seeded near-expiry grant expires without a mount request and manual renewal recovers", async () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({ client, queryClient });
  onTestFinished(() => {
    queryClient.clear();
  });
  const revision: RouterInputs["wizard"]["scrubFile"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000001",
    etag: "0123456789abcdef0123456789abcdef",
  };
  const grant: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/seed.pdf",
    expiresAt: "2026-09-09T12:00:20Z",
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
  renderComponent(
    <QueryClientProvider client={queryClient}>
      <WizardResult
        revision={revision}
        initialDownloadUrl={grant.downloadUrl}
        initialExpiresAt={grant.expiresAt}
        trpc={trpc}
        queryClient={queryClient}
        onRestart={vi.fn<() => void>()}
      />
    </QueryClientProvider>,
  );
  expect(request).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRANT_LIFETIME_MS);
  });
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The download grant expired.",
  );
  const recovered: RouterOutputs["wizard"]["refreshDownloadGrant"] = {
    downloadUrl: "https://downloads.test/recovered.pdf",
    expiresAt: "2026-09-09T12:04:00Z",
  };
  request.mockReset().mockResolvedValueOnce(recovered);
  fireEvent.click(screen.getByRole("button", { name: "Renew download" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  });
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    recovered.downloadUrl,
  );
  expect(request).toHaveBeenCalledOnce();
});
