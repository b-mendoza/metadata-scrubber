import { vi as mockApi } from "vitest";

const bodies: unknown[] = [];
const handler = mockApi.fn(async ({ request }: { request: Request }) => {
  bodies.push(await request.json());
});
const [[info] = []] = handler.mock.calls;
void info?.request.url;
const request = new Request("https://backend.test/");
void request.clone();
function unrelated(mockApi: {
  fn: () => { mock: { calls: [{ request: Request }][] } };
}) {
  const handler = mockApi.fn();
  const [[info] = []] = handler.mock.calls;
  void info?.request.json();
}
void unrelated;
