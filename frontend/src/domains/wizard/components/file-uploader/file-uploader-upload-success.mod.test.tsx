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

const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/i;
const EXPECTED_SINGLE_COUNT = 1;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.reset();
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
    storageKey: "uploads/00000000-0000-4000-8000-000000000011",
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
