import type { KyInstance } from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function request(signal: AbortSignal, id: string) {
  const bindings = readBindings();
  const { workflowHttpClient: client } = bindings;
  client.get("/api/health", { signal });
  client.post(`/api/uploads/${id}`, { signal });
  client.put(`/api/uploads`, { signal });
  client.patch("/", { signal });
  client.delete("/api/uploads", { signal });
  client.head("/api/uploads", { signal });
  readBindings().httpClient.get("/api/health", { signal });
  const alias = client;
  alias["get"]("/api/health", { signal });
}
export function unrelated(
  client: KyInstance,
  readBindings: () => { httpClient: KyInstance },
  path: string,
) {
  client.get(path);
  readBindings().httpClient.get(path);
}
