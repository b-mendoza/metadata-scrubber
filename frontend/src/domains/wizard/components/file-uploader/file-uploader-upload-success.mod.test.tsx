import { act, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
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

const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const EXPECTED_SINGLE_COUNT = 1;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;
const TEST_REPLACEMENT_MAX_FILE_SIZE_BYTES = 1;

afterEach(() => {
  FakeXMLHttpRequest.reset();
});

test("a StrictMode PDF upload sends a typed grant and direct PUT, keeps initial settings, and reports to the latest callback", async () => {
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
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  expect(createUpload).toHaveBeenCalledExactlyOnceWith(input);
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
});
