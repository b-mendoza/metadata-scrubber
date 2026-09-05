import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import {
  FakeXMLHttpRequest,
  getFileInput,
  installXMLHttpRequestFake,
} from "#/domains/wizard/components/file-uploader/file-uploader.test-helper";
import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { renderComponent } from "#/tests/utils/renderers/renderers.mod";

type CreateUpload = (
  input: RouterInputs["wizard"]["createUpload"],
) => Promise<RouterOutputs["wizard"]["createUpload"]>;

type OnUploadComplete = (result: { storageKey: string }) => void;

const FRACTIONAL_MEBIBYTE_NOTE = /1\.5 MiB/;
const TEN_MEBIBYTE_NOTE = /10 MiB/;
const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/i;
const EXPECTED_SINGLE_COUNT = 1;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;
const TEST_OVER_MAX_FILE_SIZE_BYTES = 10_485_761;
const TEST_FRACTIONAL_FILE_SIZE_BYTES = 1_572_864;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.reset();
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
  installXMLHttpRequestFake();
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "boundary.pdf",
    fileSizeBytes: TEST_MAX_FILE_SIZE_BYTES,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000010",
    uploadUrl: "https://uploads.test/boundary.pdf",
  };
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
    expect(createUpload.mock.calls).toEqual([[input]]);
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  const [request] = FakeXMLHttpRequest.requests;
  if (request == null) {
    throw new Error("The direct upload request did not start");
  }

  expect(request.body).toBe(file);

  await act(async () => {
    await request.respond({
      headers: { ETag: '"boundary-etag"' },
      status: 200,
    });
  });

  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledWith({
      storageKey: response.storageKey,
    });
  });
});

test("a PDF over the runtime limit stops before grant and upload work", async () => {
  installXMLHttpRequestFake();
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
  expect(FakeXMLHttpRequest.requests).toEqual([]);
});

test("a non-PDF stops before grant and upload work", async () => {
  installXMLHttpRequestFake();
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
  expect(FakeXMLHttpRequest.requests).toEqual([]);
});

test("a second PDF is rejected while the first PDF stays queued", async () => {
  installXMLHttpRequestFake();
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
  expect(FakeXMLHttpRequest.requests).toEqual([]);
});
