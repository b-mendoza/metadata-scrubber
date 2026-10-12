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

const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const EXPECTED_SINGLE_COUNT = 1;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;
const TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES = 1;

afterEach(() => {
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
  const [, options]: unknown[] = awsS3Call ?? [];
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

  const unsupportedRequest: Parameters<typeof options.signRequest>[0] = {
    key: "report.pdf",
    method: "DELETE",
  };
  await expect(options.signRequest(unsupportedRequest)).rejects.toThrow(
    "Only PUT upload requests are supported",
  );
  expect(createUpload).not.toHaveBeenCalled();
});

test("one PDF sends a typed grant and direct PUT, keeps initial settings, and uses the latest completion callback", async () => {
  installXMLHttpRequestFake();
  const input: RouterInputs["wizard"]["createUpload"] = {
    fileName: "report.pdf",
    fileSizeBytes: 3,
  };
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000015",
    uploadUrl: "https://uploads.test/initial-key",
  };
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
  const replacementCreateUpload = vi.fn<CreateUpload>();
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const replacementOnUploadComplete = vi.fn<OnUploadComplete>();
  const latestOnUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], input.fileName, {
    type: "application/pdf",
  });
  const { rerender, user } = renderComponent(
    <FileUploader
      createUpload={createUpload}
      maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
      onUploadComplete={onUploadComplete}
    />,
  );

  rerender(
    <FileUploader
      createUpload={replacementCreateUpload}
      maxFileSizeBytes={TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES}
      onUploadComplete={replacementOnUploadComplete}
    />,
  );
  const fileInput = await getFileInput(user);
  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );

  await waitFor(() => {
    expect(createUpload).toHaveBeenCalledExactlyOnceWith(input);
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  expect(replacementCreateUpload).not.toHaveBeenCalled();
  const [request] = FakeXMLHttpRequest.requests;
  if (request == null) {
    throw new Error("The direct upload request did not start");
  }

  expect(request.method).toBe("PUT");
  expect(request.url).toBe(response.uploadUrl);
  expect(request.getRequestHeader("Content-Type")).toBe("application/pdf");
  expect(request.body).toBe(file);

  rerender(
    <FileUploader
      createUpload={replacementCreateUpload}
      maxFileSizeBytes={TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES}
      onUploadComplete={latestOnUploadComplete}
    />,
  );
  expect(latestOnUploadComplete).not.toHaveBeenCalled();

  await act(async () => {
    await request.respond({
      headers: { ETag: '"upload-etag"' },
      status: 200,
    });
  });

  await waitFor(() => {
    expect(latestOnUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: response.storageKey,
    });
  });
  expect(onUploadComplete).not.toHaveBeenCalled();
  expect(replacementOnUploadComplete).not.toHaveBeenCalled();
});
