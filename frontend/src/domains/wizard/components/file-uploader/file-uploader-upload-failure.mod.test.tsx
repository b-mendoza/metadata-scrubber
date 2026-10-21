import { act, screen, waitFor } from "@testing-library/react";
import Uppy from "@uppy/core";
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

const RETRY_UPLOAD_BUTTON_NAME = /retry upload/iv;
const SHOW_ERROR_DETAILS_BUTTON_NAME = /show error details/iv;
const SAFE_UPLOAD_ERROR = /could not upload the file.*try again/iv;
const UPLOAD_ONE_FILE_BUTTON_NAME = /upload 1 file/iv;
const EXPECTED_SINGLE_COUNT = 1;
const EXPECTED_RETRY_REQUEST_COUNT = 2;
const FINAL_PUT_RETRY_DELAY_MS = 2100;
const TEST_MAX_FILE_SIZE_BYTES = 10_485_760;

afterEach(() => {
  vi.useRealTimers();
  FakeXMLHttpRequest.reset();
});

test("a grant failure stays safe until a deliberate retry succeeds", async () => {
  installXMLHttpRequestFake();
  const alert = vi.fn<typeof globalThis.alert>();
  vi.stubGlobal("alert", alert);
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const consoleDebug = vi.spyOn(console, "debug");
  const consoleWarn = vi.spyOn(console, "warn");
  const consoleError = vi.spyOn(console, "error");
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000015",
    uploadUrl: "https://uploads.test/retry-grant",
  };
  const createUpload = vi
    .fn<CreateUpload>()
    .mockRejectedValueOnce(
      new Error(
        "private-grant-provider-detail uploads/private-grant-key https://uploads.test/private-grant-signature private-grant-file.pdf",
      ),
    )
    .mockResolvedValueOnce(response);
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], "private-grant-file.pdf", {
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
  // eslint-disable-next-line testing-library/no-node-access -- Verify capture exclusion while the file input is still mounted.
  expect(fileInput.closest(".ph-no-capture")).not.toBeNull();

  await user.upload(fileInput, file);
  await user.click(
    screen.getByRole("button", { name: UPLOAD_ONE_FILE_BUTTON_NAME }),
  );

  expect(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  ).toBeVisible();
  expect(FakeXMLHttpRequest.requests).toEqual([]);
  expect(onUploadComplete).not.toHaveBeenCalled();
  const filename = screen.getByText(file.name);
  // eslint-disable-next-line testing-library/no-node-access -- Check that private uploader descendants stay within the capture exclusion.
  const excludedUploader = filename.closest(".ph-no-capture");
  expect(excludedUploader).not.toBeNull();
  for (const notice of screen.getAllByRole("alert")) {
    expect(excludedUploader).toContainElement(notice);
    expect(notice).toHaveTextContent("Could not upload");
    expect(notice).not.toHaveTextContent(file.name);
  }
  for (const tooltip of screen.getAllByRole("tooltip")) {
    expect(tooltip).toHaveAccessibleName(SAFE_UPLOAD_ERROR);
  }
  await user.click(
    screen.getByRole("button", { name: SHOW_ERROR_DETAILS_BUTTON_NAME }),
  );
  expect(alert).toHaveBeenCalledWith(expect.stringMatching(SAFE_UPLOAD_ERROR));
  expect(alert).not.toHaveBeenCalledWith(expect.stringContaining("private-"));
  const [uppy] = useSpy.mock.contexts;
  if (!(uppy instanceof Uppy)) {
    throw new Error("The uploader did not initialize Uppy");
  }
  expect(uppy.getState().error).toMatch(SAFE_UPLOAD_ERROR);
  const [failedFile] = uppy.getFiles();
  expect(failedFile?.error).toMatch(SAFE_UPLOAD_ERROR);
  const privateLog = `private-log-detail ${file.name}`;
  uppy.log(privateLog);
  uppy.log(privateLog, "warning");
  uppy.log(privateLog, "error");
  expect(consoleDebug).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  );
  await waitFor(() => {
    expect(FakeXMLHttpRequest.requests).toHaveLength(EXPECTED_SINGLE_COUNT);
  });
  const [request] = FakeXMLHttpRequest.requests;
  if (request == null) {
    throw new Error("The retried upload request did not start");
  }
  await act(async () => {
    await request.respond({ status: 200 });
  });
  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledExactlyOnceWith({
      storageKey: response.storageKey,
    });
  });
});

test("a final direct PUT failure stays safe and does not advance the wizard", async () => {
  installXMLHttpRequestFake();
  const alert = vi.fn<typeof globalThis.alert>();
  vi.stubGlobal("alert", alert);
  const useSpy = vi.spyOn(Uppy.prototype, "use");
  const consoleDebug = vi.spyOn(console, "debug");
  const consoleWarn = vi.spyOn(console, "warn");
  const consoleError = vi.spyOn(console, "error");
  const response: RouterOutputs["wizard"]["createUpload"] = {
    storageKey: "uploads/00000000-0000-4000-8000-000000000012",
    uploadUrl: "https://uploads.test/private-put-signature",
  };
  const createUpload = vi.fn<CreateUpload>().mockResolvedValue(response);
  const onUploadComplete = vi.fn<OnUploadComplete>();
  const file = new File(["pdf"], "private-put-file.pdf", {
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
  // eslint-disable-next-line testing-library/no-node-access -- Verify capture exclusion while the file input is still mounted.
  expect(fileInput.closest(".ph-no-capture")).not.toBeNull();

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

  const providerDetail = `private-put-provider-detail ${response.storageKey} ${response.uploadUrl} ${file.name}`;
  vi.useFakeTimers();
  FakeXMLHttpRequest.respondAutomaticallyWith({
    headers: { "x-amz-error-code": providerDetail },
    responseText: providerDetail,
    status: 500,
    statusText: providerDetail,
  });

  await act(async () => {
    await firstRequest.respond({
      headers: { "x-amz-error-code": providerDetail },
      responseText: providerDetail,
      status: 500,
      statusText: providerDetail,
    });
    await vi.advanceTimersByTimeAsync(FINAL_PUT_RETRY_DELAY_MS);
  });
  vi.useRealTimers();

  expect(
    await screen.findByRole("button", { name: RETRY_UPLOAD_BUTTON_NAME }),
  ).toBeVisible();
  expect(onUploadComplete).not.toHaveBeenCalled();
  const filename = screen.getByText(file.name);
  // eslint-disable-next-line testing-library/no-node-access -- Check that private uploader descendants stay within the capture exclusion.
  const excludedUploader = filename.closest(".ph-no-capture");
  expect(excludedUploader).not.toBeNull();
  for (const notice of screen.getAllByRole("alert")) {
    expect(excludedUploader).toContainElement(notice);
    expect(notice).toHaveTextContent("Could not upload");
    expect(notice).not.toHaveTextContent(file.name);
  }
  for (const tooltip of screen.getAllByRole("tooltip")) {
    expect(tooltip).toHaveAccessibleName(SAFE_UPLOAD_ERROR);
  }
  await user.click(
    screen.getByRole("button", { name: SHOW_ERROR_DETAILS_BUTTON_NAME }),
  );
  expect(alert).toHaveBeenCalledWith(expect.stringMatching(SAFE_UPLOAD_ERROR));
  expect(alert).not.toHaveBeenCalledWith(expect.stringContaining("private-"));
  const [uppy] = useSpy.mock.contexts;
  if (!(uppy instanceof Uppy)) {
    throw new Error("The uploader did not initialize Uppy");
  }
  expect(uppy.getState().error).toMatch(SAFE_UPLOAD_ERROR);
  const [failedFile] = uppy.getFiles();
  expect(failedFile?.error).toMatch(SAFE_UPLOAD_ERROR);
  const privateLog = `private-log-detail ${file.name}`;
  uppy.log(privateLog);
  uppy.log(privateLog, "warning");
  uppy.log(privateLog, "error");
  expect(consoleDebug).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalledWith(
    expect.stringContaining(response.storageKey),
  );
});

test("a manual retry gets a fresh grant and gives the wizard only the newest key", async () => {
  installXMLHttpRequestFake();
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
