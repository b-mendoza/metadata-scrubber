import type { Options } from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function request(signal: AbortSignal, options: Options, key: string) {
  const bindings = readBindings();
  const { workflowHttpClient: client } = bindings;
  client.get("/api/health");
  client.post("/api/uploads", {});
  client.put("/api/uploads", options);
  client.patch("/api/uploads", { ...options });
  client.delete("/api/uploads", { signal, ...options });
  client.head("/api/uploads", { signal: signal, ...options });
  readBindings().httpClient.get("/api/health");
  client.get("/api/health", { signal, [key]: null });
  const alias = client;
  alias["get"]("/api/health", {});
}
