import type { KyInstance, Options } from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function request(signal: AbortSignal, options: Options) {
  const bindings = readBindings();
  const { workflowHttpClient: client } = bindings;
  client.get("/api/health", { signal });
  client.post("/api/uploads", { ...options, signal: signal ?? null });
  client.patch("/api/uploads", { signal, ["timeout"]: 100 });
  client.delete("/api/uploads", { signal: null });
}
export function unrelated(
  client: KyInstance,
  readBindings: () => { httpClient: KyInstance },
) {
  client.get("/api/health");
  readBindings().httpClient.get("/api/health");
}
