import { screen } from "@testing-library/react";
import type { AwsS3Options } from "@uppy/aws-s3";
import { vi } from "vitest";

import type { renderComponent } from "#/tests/utils/renderers/renderers.mod";

const BROWSE_FILES_BUTTON_NAME = /browse files/i;
const DONE_READY_STATE = 4;
const NO_HTTP_STATUS = 0;
const NO_TIMEOUT_MILLISECONDS = 0;
const OPENED_READY_STATE = 1;
const UNSENT_READY_STATE = 0;

type TestAwsS3Options = AwsS3Options<
  Record<string, unknown>,
  Record<string, unknown>
>;

type AwsS3SignRequest = Extract<
  TestAwsS3Options,
  { signRequest: unknown }
>["signRequest"];

export type ConfiguredAwsS3Options = TestAwsS3Options & {
  generateObjectKey: NonNullable<TestAwsS3Options["generateObjectKey"]>;
  signRequest: AwsS3SignRequest;
};

export interface FakeXMLHttpResponse {
  headers?: Record<string, string>;
  responseText?: string;
  status: number;
  statusText?: string;
}

export interface FakeXMLHttpRequest extends EventTarget {
  body: XMLHttpRequestBodyInit | null;
  method: string;
  onerror: ((event: ProgressEvent) => void) | null;
  onload: ((event: ProgressEvent) => unknown) | null;
  readyState: number;
  responseText: string;
  responseType: XMLHttpRequestResponseType;
  status: number;
  statusText: string;
  timeout: number;
  upload: EventTarget & {
    onprogress: ((event: ProgressEvent) => void) | null;
  };
  url: string;
  withCredentials: boolean;
  abort: () => void;
  getRequestHeader: (name: string) => string | null;
  getResponseHeader: (name: string) => string | null;
  open: (method: string, url: string | URL) => void;
  respond: (response: FakeXMLHttpResponse) => Promise<void>;
  send: (body?: XMLHttpRequestBodyInit | null) => void;
  setRequestHeader: (name: string, value: string) => void;
}

let automaticResponse: FakeXMLHttpResponse | null = null;
const requests: FakeXMLHttpRequest[] = [];

const createFakeXMLHttpRequest = (): FakeXMLHttpRequest => {
  const requestHeaders = new Map<string, string>();
  const responseHeaders = new Map<string, string>();
  const responseType: XMLHttpRequestResponseType = "";
  const upload = Object.assign(new EventTarget(), {
    onprogress: null as ((event: ProgressEvent) => void) | null,
  });
  const request = Object.assign(new EventTarget(), {
    body: null as XMLHttpRequestBodyInit | null,
    method: "",
    onerror: null as ((event: ProgressEvent) => void) | null,
    onload: null as ((event: ProgressEvent) => unknown) | null,
    readyState: UNSENT_READY_STATE,
    responseText: "",
    responseType,
    status: NO_HTTP_STATUS,
    statusText: "",
    timeout: NO_TIMEOUT_MILLISECONDS,
    upload,
    url: "",
    withCredentials: false,
    abort: () => {
      request.statusText = "Aborted";
    },
    getRequestHeader: (name: string) => {
      return requestHeaders.get(name.toLowerCase()) ?? null;
    },
    getResponseHeader: (name: string) => {
      return responseHeaders.get(name.toLowerCase()) ?? null;
    },
    open: (method: string, url: string | URL) => {
      request.method = method;
      request.url = url.toString();
      request.readyState = OPENED_READY_STATE;
    },
    respond: async (response: FakeXMLHttpResponse) => {
      request.status = response.status;
      request.statusText = response.statusText ?? "";
      request.responseText = response.responseText ?? "";
      request.readyState = DONE_READY_STATE;
      responseHeaders.clear();

      for (const [name, value] of Object.entries(response.headers ?? {})) {
        responseHeaders.set(name.toLowerCase(), value);
      }

      await request.onload?.(new ProgressEvent("load"));
    },
    send: (body: XMLHttpRequestBodyInit | null = null) => {
      request.body = body;
      requests.push(request);

      if (automaticResponse != null) {
        void request.respond(automaticResponse);
      }
    },
    setRequestHeader: (name: string, value: string) => {
      requestHeaders.set(name.toLowerCase(), value);
    },
  });

  return request;
};

const fakeXMLHttpRequestConstructor = vi.fn(
  function FakeXMLHttpRequestConstructor() {
    return createFakeXMLHttpRequest();
  },
);

export const FakeXMLHttpRequest = Object.assign(fakeXMLHttpRequestConstructor, {
  requests,
  reset: () => {
    automaticResponse = null;
    requests.length = NO_HTTP_STATUS;
  },
  respondAutomaticallyWith: (response: FakeXMLHttpResponse) => {
    automaticResponse = response;
  },
});

export const getFileInput = async (
  user: ReturnType<typeof renderComponent>["user"],
) => {
  const capturedFileInput: { current: HTMLInputElement | null } = {
    current: null,
  };
  const captureFileInput = (event: Event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.type === "file"
    ) {
      capturedFileInput.current = event.target;
    }
  };
  document.addEventListener("click", captureFileInput);

  try {
    await user.click(
      screen.getByRole("button", { name: BROWSE_FILES_BUTTON_NAME }),
    );
  } finally {
    document.removeEventListener("click", captureFileInput);
  }

  if (capturedFileInput.current == null) {
    throw new Error("Uppy did not open its local file input");
  }

  return capturedFileInput.current;
};

export const installXMLHttpRequestFake = () => {
  FakeXMLHttpRequest.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
};

export const isConfiguredAwsS3Options = (
  value: unknown,
): value is ConfiguredAwsS3Options => {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  return (
    "generateObjectKey" in value &&
    typeof value.generateObjectKey === "function" &&
    "signRequest" in value &&
    typeof value.signRequest === "function"
  );
};
