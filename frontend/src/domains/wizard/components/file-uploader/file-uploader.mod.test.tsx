import { Buffer } from "node:buffer";

import { screen, waitFor } from "@testing-library/react";
import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import type { HttpResponseResolver } from "msw";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import { getFileInput } from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

type CreateUpload = (
  input: RouterInputs["wizard"]["createUpload"],
) => Promise<RouterOutputs["wizard"]["createUpload"]>;

type OnUploadComplete = (result: { storageKey: string }) => void;

const FRACTIONAL_MEBIBYTE_NOTE = /1\.5 MiB/v;
const TEN_MEBIBYTE_NOTE = /10 MiB/v;
const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const EXPECTED_SINGLE_COUNT = 1;
const EXPECTED_DESTROY_COUNT_AFTER_REPLACEMENT_UNMOUNT = 2;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;
const TEST_OVER_MAX_FILE_SIZE_BYTES = 10_485_761;
const TEST_FRACTIONAL_FILE_SIZE_BYTES = 1_572_864;

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

test("Uppy keeps its initial instance when uploader props change", () => {
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const destroySpy = vi.spyOn(Uppy.prototype, "destroy");
  const createUpload = vi.fn<CreateUpload>();
  const replacementCreateUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const { rerender, unmount } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const [initialUppy] = useSpy.mock.contexts;

  expect(initialUppy).toBeInstanceOf(Uppy);
  expect(destroySpy).not.toHaveBeenCalled();

  rerender(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  rerender(
    <FileUploader
      createUpload={replacementCreateUpload}
      maxFileSizeBytes={TEST_FRACTIONAL_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );

  expect(useSpy.mock.calls.filter(([Plugin]) => Plugin === AwsS3)).toHaveLength(
    EXPECTED_SINGLE_COUNT,
  );
  expect(
    useSpy.mock.contexts.every((instance) => instance === initialUppy),
  ).toBe(true);
  expect(destroySpy).not.toHaveBeenCalled();

  unmount();

  expect(destroySpy).toHaveBeenCalledOnce();
  const [destroyedUppy] = destroySpy.mock.contexts;
  expect(destroyedUppy).toBe(initialUppy);
});

test("a keyed remount destroys the old Uppy and keeps its replacement until unmount", () => {
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const destroySpy = vi.spyOn(Uppy.prototype, "destroy");
  const createUpload = vi.fn<CreateUpload>();
  const replacementCreateUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const { rerender, unmount } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      key="initial"
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const [initialUppy] = useSpy.mock.contexts;

  expect(initialUppy).toBeInstanceOf(Uppy);
  expect(destroySpy).not.toHaveBeenCalled();
  useSpy.mockClear();

  rerender(
    <FileUploader
      createUpload={replacementCreateUpload}
      key="replacement"
      maxFileSizeBytes={TEST_FRACTIONAL_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const [replacementUppy] = useSpy.mock.contexts;

  expect(replacementUppy).toBeInstanceOf(Uppy);
  expect(replacementUppy).not.toBe(initialUppy);
  expect(useSpy.mock.calls.filter(([Plugin]) => Plugin === AwsS3)).toHaveLength(
    EXPECTED_SINGLE_COUNT,
  );
  expect(destroySpy).toHaveBeenCalledOnce();
  const [destroyedUppy] = destroySpy.mock.contexts;
  expect(destroyedUppy).toBe(initialUppy);

  unmount();

  expect(destroySpy).toHaveBeenCalledTimes(
    EXPECTED_DESTROY_COUNT_AFTER_REPLACEMENT_UNMOUNT,
  );
  const [, destroyedReplacementUppy] = destroySpy.mock.contexts;
  expect(destroyedReplacementUppy).toBe(replacementUppy);
});

test("the Dashboard note shows a whole-number runtime MiB limit", () => {
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();

  renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );

  expect(screen.getByText(TEN_MEBIBYTE_NOTE)).toBeVisible();
});

test("the Dashboard note shows a fractional runtime MiB limit", () => {
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();

  renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_FRACTIONAL_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );

  expect(screen.getByText(FRACTIONAL_MEBIBYTE_NOTE)).toBeVisible();
});

test("a PDF at the inclusive runtime limit gets a grant and uploads directly", async () => {
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "boundary.pdf",
    fileSizeBytes: TEST_MAX_FILE_SIZE_BYTES,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000010",
    uploadUrl: "https://uploads.test/boundary.pdf",
  };
  const uploadBodies: ArrayBuffer[] = [];
  const handler = vi.fn<HttpResponseResolver>(async ({ request }) => {
    uploadBodies.push(await request.arrayBuffer());
    return new HttpResponse(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag",
        ETag: '"boundary-etag"',
      },
      status: 200,
    });
  });
  server.use(http.put(response.uploadUrl, handler));
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(
    [new Uint8Array(TEST_MAX_FILE_SIZE_BYTES)],
    input.fileName,
    {
      type: "application/pdf",
    },
  );
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
    expect(onUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: response.storageKey,
    });
  });
  expect(createUpload).toHaveBeenCalledExactlyOnceWith(input);
  expect(handler).toHaveBeenCalledOnce();
  expect(putStarted).toHaveBeenCalledOnce();
  const [[handlerInfo] = []] = handler.mock.calls;
  expect.assert(handlerInfo?.request instanceof Request);
  expect(handlerInfo.request.method).toBe("PUT");
  expect(handlerInfo.request.url).toBe(response.uploadUrl);
  const [body] = uploadBodies;
  expect.assert(body instanceof ArrayBuffer);
  const fileBytes = Buffer.from(await file.arrayBuffer());
  expect(Buffer.from(body).equals(fileBytes)).toBe(true);
});

test("a PDF over the runtime limit stops before grant and upload work", async () => {
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(
    [new Uint8Array(TEST_OVER_MAX_FILE_SIZE_BYTES)],
    "oversize.pdf",
    {
      type: "application/pdf",
    },
  );
  const { user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);

  await user.upload(fileInput, file);

  expect(await screen.findAllByRole("alert")).not.toEqual([]);
  expect(screen.queryAllByRole("listitem")).toEqual([]);
  expect(createUpload).not.toHaveBeenCalled();
  expect(putStarted).not.toHaveBeenCalled();
});

test("a non-PDF stops before grant and upload work", async () => {
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["plain text"], "notes.txt", {
    type: "text/plain",
  });
  const { user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);
  fileInput.accept = "";

  await user.upload(fileInput, file);

  expect(await screen.findAllByRole("alert")).not.toEqual([]);
  expect(screen.queryAllByRole("listitem")).toEqual([]);
  expect(createUpload).not.toHaveBeenCalled();
  expect(putStarted).not.toHaveBeenCalled();
});

test("a second PDF is rejected while the first PDF stays queued", async () => {
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const firstFile = new File(["first"], "first.pdf", {
    type: "application/pdf",
  });
  const secondFile = new File(["second"], "second.pdf", {
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

  await user.upload(fileInput, firstFile);
  expect(screen.getAllByRole("listitem")).toHaveLength(EXPECTED_SINGLE_COUNT);

  await user.upload(fileInput, secondFile);

  expect(await screen.findAllByRole("alert")).not.toEqual([]);
  expect(screen.getAllByRole("listitem")).toHaveLength(EXPECTED_SINGLE_COUNT);
  expect(screen.getByText(firstFile.name)).toBeVisible();
  expect(screen.queryByText(secondFile.name)).not.toBeInTheDocument();
  expect(createUpload).not.toHaveBeenCalled();
  expect(putStarted).not.toHaveBeenCalled();
});
