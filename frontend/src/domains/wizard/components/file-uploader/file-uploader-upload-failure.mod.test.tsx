import { act, screen, waitFor } from "@testing-library/react";
import type { HttpResponseResolver } from "msw";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { getFileInput } from "#/tests/utils/file-input/file-input.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

type CreateUpload = (
  input: RouterInputs["wizard"]["createUpload"],
) => Promise<RouterOutputs["wizard"]["createUpload"]>;

type OnUploadComplete = (result: { storageKey: string }) => void;

const RETRY_UPLOAD_BUTTON_NAME = /retry upload/iv;
const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const EXPECTED_RETRY_REQUEST_COUNT = 2;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;

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
  vi.useRealTimers();
});

afterAll(() => {
  server.close();
});

test("a grant failure does not send a PUT or advance the wizard", async () => {
  const createUpload = vi
    .fn<CreateUpload>()
    .mockRejectedValue(new Error("Could not create the upload grant"));
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], "report.pdf", {
    type: "application/pdf",
  });
  const { user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);

  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );

  expect(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  ).toBeVisible();
  expect(createUpload).toHaveBeenCalledOnce();
  expect(putStarted).not.toHaveBeenCalled();
  expect(onUploadComplete).not.toHaveBeenCalled();
});

test("a final direct PUT failure does not advance the wizard", async () => {
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000012",
    uploadUrl: "https://uploads.test/failing-key",
  };
  const uploadResponse = Promise.withResolvers<null>();
  const handler = vi.fn<HttpResponseResolver>(async () => {
    await uploadResponse.promise;
    return new HttpResponse(null, {
      headers: { "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  });
  server.use(http.put(response.uploadUrl, handler));
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], "report.pdf", {
    type: "application/pdf",
  });
  const { user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);

  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );
  await waitFor(() => {
    expect(handler).toHaveBeenCalledOnce();
  });

  // Date must advance with timers so Dashboard debounce timers can finish.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  await act(async () => {
    uploadResponse.resolve(null);
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();

  expect(putStarted).toHaveBeenCalledTimes(handler.mock.calls.length);
  expect(createUpload).toHaveBeenCalledOnce();
  const [[handlerInfo] = []] = handler.mock.calls;
  expect.assert(handlerInfo?.request instanceof Request);
  expect(handlerInfo.request.url).toBe(response.uploadUrl);

  expect(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  ).toBeVisible();
  expect(onUploadComplete).not.toHaveBeenCalled();
});

test("a manual retry gets a fresh grant and gives the wizard only the newest key", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 3,
  };
  const responseOne: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000013",
    uploadUrl: "https://uploads.test/old-key",
  };
  const responseTwo: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000014",
    uploadUrl: "https://uploads.test/new-key",
  };
  const firstHandler = vi.fn<HttpResponseResolver>(
    () =>
      new HttpResponse(null, {
        headers: { "Access-Control-Allow-Origin": "*" },
        status: 403,
      }),
  );
  const secondHandler = vi.fn<HttpResponseResolver>(
    () =>
      new HttpResponse(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "ETag",
          ETag: '"new-etag"',
        },
        status: 200,
      }),
  );
  server.use(
    http.put(responseOne.uploadUrl, firstHandler),
    http.put(responseTwo.uploadUrl, secondHandler),
  );
  const createUpload = vi
    .fn<CreateUpload>()
    .mockResolvedValueOnce(responseOne)
    .mockResolvedValueOnce(responseTwo);
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], input.fileName, {
    type: "application/pdf",
  });
  const { user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);

  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );
  await user.click(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  );

  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: responseTwo.storageKey,
    });
  });
  expect(createUpload.mock.calls).toEqual([[input], [input]]);
  expect(firstHandler).toHaveBeenCalledOnce();
  expect(secondHandler).toHaveBeenCalledOnce();
  expect(putStarted).toHaveBeenCalledTimes(EXPECTED_RETRY_REQUEST_COUNT);
  const [[firstInfo] = []] = firstHandler.mock.calls;
  const [[secondInfo] = []] = secondHandler.mock.calls;
  expect.assert(firstInfo?.request instanceof Request);
  expect.assert(secondInfo?.request instanceof Request);
  expect(firstInfo.request.url).toBe(responseOne.uploadUrl);
  expect(secondInfo.request.url).toBe(responseTwo.uploadUrl);
});
