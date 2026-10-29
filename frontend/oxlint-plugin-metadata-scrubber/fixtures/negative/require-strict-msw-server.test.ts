import { setupServer as createServer } from "msw/node";
import { afterAll, afterEach as reset } from "vitest";

const missing = createServer();
const warning = createServer();
warning.listen({ onUnhandledFrame: "warn" });
reset(() => warning.resetHandlers());
afterAll(() => warning.close());
const outside = createServer();
outside.listen({ onUnhandledFrame: "error" });
outside.resetHandlers();
outside.close();
const shadowed = createServer();
shadowed.listen({ onUnhandledFrame: "error" });
function configure(reset: (callback: () => void) => void) {
  reset(() => shadowed.resetHandlers());
}
afterAll(() => shadowed.close());
const legacy = createServer();
// @ts-expect-error MSW 3 removed onUnhandledRequest. The fixture checks this invalid option.
legacy.listen({ onUnhandledRequest: "error" });
reset(() => legacy.resetHandlers());
afterAll(() => legacy.close());
void missing;
void configure;

const noOptions = createServer();
noOptions.listen();
reset(() => noOptions.resetHandlers());
afterAll(() => noOptions.close());
reset(() => {
  const shadowed = { resetHandlers() {} };
  shadowed.resetHandlers();
});

createServer();
