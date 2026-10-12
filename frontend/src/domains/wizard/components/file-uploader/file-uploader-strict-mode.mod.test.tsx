import { act, screen, waitFor } from "@testing-library/react";
import Uppy from "@uppy/core";
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
const STRICT_MODE_INSTANCE_COUNT = 2;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;

afterEach(() => {
  FakeXMLHttpRequest.reset();
});

test("StrictMode replay preserves PDF uploads and unmount destroys every Uppy instance", async () => {
  installXMLHttpRequestFake();
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const destroySpy = vi.spyOn(Uppy.prototype, "destroy");
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
  const file = new File(["pdf"], input.fileName, { type: "application/pdf" });
  const { unmount, user } = renderComponent(
    <StrictMode>
      <FileUploader
        createUpload={createUpload}
        maxFileSizeBytes={TEST_MAX_FILE_SIZE_BYTES}
        onUploadComplete={onUploadComplete}
      />
    </StrictMode>,
  );
  const createdInstances = new Set(useSpy.mock.contexts);
  expect(createdInstances.size).toBe(STRICT_MODE_INSTANCE_COUNT);
  const [replayedInstance, inUseInstance] = [...createdInstances];
  expect(destroySpy.mock.contexts).toEqual([replayedInstance]);
  if (!(inUseInstance instanceof Uppy)) {
    throw new Error("The live Uppy instance was not created");
  }
  const fileInput = await getFileInput(user);
  await user.upload(fileInput, file);
  expect(inUseInstance.getFiles()).toEqual([
    expect.objectContaining({ data: file }),
  ]);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );
  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  expect(createUpload).toHaveBeenCalledExactlyOnceWith(input);
  const [request] = FakeXMLHttpRequest.requests;
  if (request == null) {
    throw new Error("The direct upload request did not start");
  }
  expect(request.method).toBe("PUT");
  await act(async () => {
    await request.respond({ headers: { ETag: '"upload-etag"' }, status: 200 });
  });
  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: response.storageKey,
    });
  });
  expect(destroySpy.mock.contexts).toEqual([replayedInstance]);
  unmount();
  expect(destroySpy.mock.contexts).toEqual([replayedInstance, inUseInstance]);
  expect(new Set(destroySpy.mock.contexts)).toEqual(createdInstances);
});
