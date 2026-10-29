import request from "ky";
import * as kyModule from "ky";
import { getAppBindings as readBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function load(signal: AbortSignal) {
  const bindings = readBindings();
  const { workflowHttpClient: client } = bindings;
  client.get("/api/health", { signal }).json();
  const alias = client;
  alias.post("/api/uploads", { signal }).json();
  readBindings().httpClient.get("/api/health", { signal }).json();
  request("/api/health").json();
  request.get("/api/health").json();
  const fetchJson = request;
  fetchJson.post("/api/uploads")["json"]();
  kyModule.default("/api/health").json();
}
