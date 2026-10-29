import type { KyInstance } from "ky";
import request from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function load(signal: AbortSignal, schema: import("zod").ZodType) {
  const { workflowHttpClient: client } = readBindings();
  client.get("/api/health", { signal }).json(schema);
  request("/api/health").json(schema);
  request.post("/api/uploads").json(schema);
  const alias = request;
  alias.get("/api/health").json(schema);
}
export function unrelated(
  request: KyInstance,
  client: KyInstance,
  response: Response,
  readBindings: () => { httpClient: KyInstance },
) {
  request("/api/health").json();
  client.get("/api/health").json();
  response.json();
  readBindings().httpClient.get("/api/health").json();
}
