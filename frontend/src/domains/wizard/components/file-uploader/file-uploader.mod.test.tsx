import { act, screen, waitFor } from "@testing-library/react";
import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import { afterEach, expect, test, vi } from "vitest";

import { FileUploader } from "#/domains/wizard/components/file-uploader/file-uploader.mod";
import {
  FakeXMLHttpRequest,
  getFileInput,
  installXMLHttpRequestFake,
  isConfiguredAwsS3Options,
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
const RETRY_UPLOAD_BUTTON_NAME = /retry upload/i;
const TEN_MEBIBYTE_NOTE = /10 MiB/;
const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/i;
const EXPECTED_SINGLE_COUNT = 1;
const EXPECTED_RETRY_REQUEST_COUNT = 2;
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
    storageKey: "uploads/boundary-key",
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

test("AWS S3 uses one presigned PUT mode without browser credentials", async () => {
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const createUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();

  renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );

  const awsS3Call = useSpy.mock.calls.find(([Plugin]) => Plugin === AwsS3);
  const options: unknown = awsS3Call?.at(EXPECTED_SINGLE_COUNT);
  if (!isConfiguredAwsS3Options(options)) {
    throw new Error("The uploader did not configure AwsS3 signRequest mode");
  }

  expect(options.shouldUseMultipart).toBe(false);
  expect(options).not.toHaveProperty("getCredentials");
  expect(options).not.toHaveProperty("getUploadParameters");
  expect(options).not.toHaveProperty("s3Endpoint");
  expect(options).not.toHaveProperty("region");
  expect(options).not.toHaveProperty("companionEndpoint");
  expect(options).not.toHaveProperty("endpoint");
  expect(options).not.toHaveProperty("headers");

  const keyUppy = new Uppy<Record<string, unknown>, Record<string, unknown>>();
  const fileData = new File(["pdf"], "report.pdf", {
    type: "application/pdf",
  });
  const fileID = keyUppy.addFile({
    data: fileData,
    name: fileData.name,
    type: fileData.type,
  });
  const file = keyUppy.getFile(fileID);

  expect(options.generateObjectKey(file)).toBe(file.id);

  const unsupportedRequest: Parameters<typeof options.signRequest>[0] = {
    key: file.id,
    method: "DELETE",
  };
  await expect(options.signRequest(unsupportedRequest)).rejects.toThrow();
  expect(createUpload).not.toHaveBeenCalled();

  keyUppy.destroy();
});

test("one valid PDF sends one typed grant request and one direct PUT", async () => {
  installXMLHttpRequestFake();
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 3,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/opaque-key",
    uploadUrl: "https://uploads.test/opaque-key",
  };
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
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

  await waitFor(() => {
    expect(createUpload).toHaveBeenCalledOnce();
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  expect(createUpload.mock.calls).toEqual([[input]]);
  const [request] = FakeXMLHttpRequest.requests;
  if (request == null) {
    throw new Error("The direct upload request did not start");
  }

  expect(request.method).toBe("PUT");
  expect(request.url).toBe(response.uploadUrl);
  expect(request.getRequestHeader("Content-Type")).toBe("application/pdf");
  expect(request.body).toBe(file);
  expect(request.url).not.toContain("/api/upload");
  expect(onUploadComplete).not.toHaveBeenCalled();

  await act(async () => {
    await request.respond({
      headers: { ETag: '"upload-etag"' },
      responseText: "",
      status: 200,
    });
  });

  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledOnce();
  });
  expect(onUploadComplete.mock.calls).toEqual([
    [{ storageKey: response.storageKey }],
  ]);
});

test("a grant failure does not send a PUT or advance the wizard", async () => {
  installXMLHttpRequestFake();
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
  expect(FakeXMLHttpRequest.requests).toEqual([]);
  expect(onUploadComplete).not.toHaveBeenCalled();
});

test("a final direct PUT failure does not advance the wizard", async () => {
  installXMLHttpRequestFake();
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/failing-key",
    uploadUrl: "https://uploads.test/failing-key",
  };
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
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  const [firstRequest] = FakeXMLHttpRequest.requests;
  if (firstRequest == null) {
    throw new Error("The direct upload request did not start");
  }

  vi.useFakeTimers();
  FakeXMLHttpRequest.respondAutomaticallyWith({
    status: 500,
    statusText: "Internal Server Error",
  });

  await act(async () => {
    await firstRequest.respond({
      status: 500,
      statusText: "Internal Server Error",
    });
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();

  expect(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  ).toBeVisible();
  expect(onUploadComplete).not.toHaveBeenCalled();
});

test("a manual retry gets a fresh grant and gives the wizard only the newest key", async () => {
  installXMLHttpRequestFake();
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 3,
  };
  const responseOne: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/old-key",
    uploadUrl: "https://uploads.test/old-key",
  };
  const responseTwo: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/new-key",
    uploadUrl: "https://uploads.test/new-key",
  };
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
  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  const [firstRequest] = FakeXMLHttpRequest.requests;
  if (firstRequest == null) {
    throw new Error("The first direct upload request did not start");
  }
  expect(firstRequest.url).toBe(responseOne.uploadUrl);

  await act(async () => {
    await firstRequest.respond({
      status: 403,
      statusText: "Forbidden",
    });
  });
  await user.click(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  );

  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(
      EXPECTED_RETRY_REQUEST_COUNT,
    );
  });
  const [, secondRequest] = FakeXMLHttpRequest.requests;
  if (secondRequest == null) {
    throw new Error("The retried direct upload request did not start");
  }

  expect(createUpload.mock.calls).toEqual([[input], [input]]);
  expect(secondRequest.url).toBe(responseTwo.uploadUrl);
  expect(secondRequest.url).not.toBe(responseOne.uploadUrl);

  await act(async () => {
    await secondRequest.respond({
      headers: { ETag: '"new-etag"' },
      status: 200,
    });
  });

  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledWith({
      storageKey: responseTwo.storageKey,
    });
  });
  expect(onUploadComplete).not.toHaveBeenCalledWith({
    storageKey: responseOne.storageKey,
  });
});
