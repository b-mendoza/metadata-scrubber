import type { HttpResponseResolver } from "msw";
import { expect, vi as mockApi } from "vitest";
import * as vitest from "vitest";

const handler = mockApi.fn<HttpResponseResolver>();
void handler.mock.calls[0]?.[0].request.json();
void handler.mock.lastCall?.[0].request.text();
void handler.mock.calls.at(-1)?.[0].request.formData();
const [[handlerInfo] = []] = handler.mock.calls;
expect.assert(handlerInfo != null);
void handlerInfo.request.arrayBuffer();
expect.assert(handler.mock.lastCall != null);
const { request: saved } = handler.mock.lastCall[0];
void saved.blob();
const last = handler.mock.calls.at(-1);
expect.assert(last != null);
const [info] = last;
const request = info.request;
void request.clone();
const fetchMock = vitest.vi.fn<typeof fetch>();
const [[input] = []] = fetchMock.mock.calls;
expect.assert(input instanceof Request);
void input.json();

export function readAt(index: number) {
  return handler.mock.calls[index]?.[0].request.json();
}
