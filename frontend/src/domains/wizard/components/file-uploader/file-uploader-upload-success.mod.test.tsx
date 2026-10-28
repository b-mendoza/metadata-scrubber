import { Buffer } from "node:buffer";

import { act, screen, waitFor } from "@testing-library/react";
import type { HttpResponseResolver } from "msw";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { getFileInput } from "#/tests/utils/file-input/file-input.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;
const TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES = 1;

// A cross-origin PUT with a PDF body requires a CORS preflight.
const server = setupServer(
  http.options(
    "https://uploads.test/*",
    () =>
      new HttpResponse(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PUT",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        status: 204,
      }),
  ),
);
const putStarted = vi.fn<(request: Request) => void>();

beforeAll(() => {
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PUT") {
      putStarted(request);
    }
  });
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
  putStarted.mockClear();
});

afterAll(() => {
  server.close();
});

test("a StrictMode PDF upload sends a typed grant and direct PUT, keeps initial settings, and reports to the latest callback", async () => {
  type CreateUpload = (
    input: RouterInputs["wizard"]["createUpload"],
  ) => Promise<RouterOutputs["wizard"]["createUpload"]>;

  type OnUploadComplete = (result: { storageKey: string }) => void;

  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 3,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000015",
    uploadUrl: "https://uploads.test/initial-key",
  };
  const uploadResponse = Promise.withResolvers<null>();
  const uploadBodies: ArrayBuffer[] = [];
  const handler = vi.fn<HttpResponseResolver>(async ({ request }) => {
    uploadBodies.push(await request.arrayBuffer());
    await uploadResponse.promise;
    return new HttpResponse(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag",
        ETag: '"upload-etag"',
      },
      status: 200,
    });
  });
  server.use(http.put(response.uploadUrl, handler));
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
  const replacementCreateUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const latestOnUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], input.fileName, {
    type: "application/pdf",
  });
  const { rerender, user } = renderComponent(
    <StrictMode>
      <FileUploader
        createUpload={createUpload}
        maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
        onUploadComplete={onUploadComplete}
      />
    </StrictMode>,
  );

  rerender(
    <StrictMode>
      <FileUploader
        createUpload={replacementCreateUpload}
        maxFileSizeBytes={TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES}
        onUploadComplete={onUploadComplete}
      />
    </StrictMode>,
  );
  const fileInput = await getFileInput(user);
  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );

  await waitFor(() => {
    expect(handler).toHaveBeenCalledOnce();
    expect(uploadBodies).not.toEqual([]);
  });
  expect(createUpload).toHaveBeenCalledExactlyOnceWith(input);
  expect(replacementCreateUpload).not.toHaveBeenCalled();
  expect(putStarted).toHaveBeenCalledOnce();
  const [[handlerInfo] = []] = handler.mock.calls;
  expect.assert(handlerInfo?.request instanceof Request);
  expect(handlerInfo.request.method).toBe("PUT");
  expect(handlerInfo.request.url).toBe(response.uploadUrl);
  expect(handlerInfo.request.headers.get("Content-Type")).toBe(
    "application/pdf",
  );
  const [body] = uploadBodies;
  expect.assert(body instanceof ArrayBuffer);
  const fileBytes = Buffer.from(await file.arrayBuffer());
  expect(Buffer.from(body).equals(fileBytes)).toBe(true);

  rerender(
    <StrictMode>
      <FileUploader
        createUpload={replacementCreateUpload}
        maxFileSizeBytes={TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES}
        onUploadComplete={latestOnUploadComplete}
      />
    </StrictMode>,
  );
  expect(latestOnUploadComplete).not.toHaveBeenCalled();

  await act(async () => {
    uploadResponse.resolve(null);
    await uploadResponse.promise;
  });

  await waitFor(() => {
    expect(latestOnUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: response.storageKey,
    });
  });
  expect(onUploadComplete).not.toHaveBeenCalled();
});
