import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export function checkTransport(path: string): void {
  const { httpClient } = getAppBindings();
  void httpClient.get(path);
}
