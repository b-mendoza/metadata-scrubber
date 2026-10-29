import { setupServer as createServer } from "msw/node";
import * as msw from "msw/node";
import { afterAll as finish, afterEach as reset } from "vitest";
import * as vitest from "vitest";

const server = createServer();
const alias = server;
alias.listen({ onUnhandledFrame: "error" });
reset(() => alias.resetHandlers());
finish(() => server.close());
const other = msw.setupServer();
other.listen({ onUnhandledFrame: "error" });
vitest.afterEach(() => other.resetHandlers());
vitest.afterAll(() => other.close());
function unrelated(createServer: () => { listen: () => void }) {
  const local = createServer();
  local.listen();
}
void unrelated;
