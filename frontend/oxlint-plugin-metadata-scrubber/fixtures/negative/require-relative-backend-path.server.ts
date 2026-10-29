import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function request(signal: AbortSignal, backendUrl: string, path: string) {
  const { workflowHttpClient: client } = readBindings();
  client.get(`${backendUrl}/api/health`, { signal });
  client.post(path, { signal });
  client.put("https://backend.test/api/uploads", { signal });
  client.patch("//backend.test/api/uploads", { signal });
  client.delete("", { signal });
  client.head("/\\backend.test", { signal });
  // @ts-expect-error TS2554: The fixture checks a missing path argument.
  readBindings().httpClient.get();
  const alias = client;
  alias["get"](path + "/api", { signal });
}
