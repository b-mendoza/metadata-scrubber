import { expect, test, vi } from "vitest";
import * as z from "zod";

import { postUpload, UPLOAD_FORM_DATA_READ_FAILURE_MESSAGE } from "./upload";

const UPLOAD_PATHNAME = "/api/upload";
const UPLOAD_URL = "http://localhost/api/upload";

test("preserves a rejected form-data promise as the error cause", async () => {
  const cause = new Error("The formData promise rejected.");
  const request = new Request(UPLOAD_URL, { method: "POST" });
  vi.spyOn(request, "formData").mockRejectedValue(cause);

  let rejection: unknown = null;
  try {
    await postUpload({
      context: globalThis.undefined,
      next: () => {
        throw new Error("The upload POST handler must not call next.");
      },
      params: {},
      pathname: UPLOAD_PATHNAME,
      request,
    });
  } catch (error: unknown) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(Error);
  if (!(rejection instanceof Error)) {
    throw new Error("The upload POST handler did not reject with an Error.");
  }
  expect(rejection.message).toBe(UPLOAD_FORM_DATA_READ_FAILURE_MESSAGE);
  expect(rejection.cause).toBe(cause);
});

test('keeps a missing "file" validation failure as a ZodError', async () => {
  interface UploadFormDataWithoutFile {
    note: string;
  }

  const payload = {
    note: "This valid multipart payload has no file field.",
  } satisfies UploadFormDataWithoutFile;
  const formData = new FormData();
  formData.set("note", payload.note);
  const request = new Request(UPLOAD_URL, {
    body: formData,
    method: "POST",
  });

  await expect(
    postUpload({
      context: globalThis.undefined,
      next: () => {
        throw new Error("The upload POST handler must not call next.");
      },
      params: {},
      pathname: UPLOAD_PATHNAME,
      request,
    }),
  ).rejects.toBeInstanceOf(z.ZodError);
});
