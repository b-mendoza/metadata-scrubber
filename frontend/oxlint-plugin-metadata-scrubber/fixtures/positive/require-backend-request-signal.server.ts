import type { KyInstance, Options } from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function request(signal: AbortSignal, options: Options) {
  const bindings = readBindings();
  const { workflowHttpClient: client } = bindings;
  client.get("/api/health", { signal });
  client.post("/api/uploads", { ...options, signal: signal ?? null });
  client.put("/api/uploads", { ["signal"]: signal });
  client.patch("/api/uploads", { signal, ["timeout"]: 100 });
  client.delete("/api/uploads", { signal: null });
  client.head("/api/uploads", { signal });
  readBindings().httpClient.get("/api/health", { signal });
  const alias = client;
  alias["get"]("/api/health", { signal });
}
export function unrelated(
  client: KyInstance,
  readBindings: () => { httpClient: KyInstance },
) {
  client.get("/api/health");
  readBindings().httpClient.get("/api/health");
}
