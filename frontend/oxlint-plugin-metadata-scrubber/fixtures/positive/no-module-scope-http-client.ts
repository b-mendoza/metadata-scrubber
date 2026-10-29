import type { KyInstance } from "ky";
import request from "ky";
import { createHttpClient as buildClient } from "#/shared/libs/ky/http-client.mod.server";

export function appBindingsMiddleware(baseUrl: URL) {
  const client = buildClient(baseUrl);
  return { client, extended: request.extend({}), fresh: request.create({}) };
}
export function unrelated(request: KyInstance, buildClient: () => unknown) {
  return { client: buildClient(), extended: request.extend({}) };
}
const local = { create: () => ({}) };
export const unrelatedClient = local.create();

{
  const request = { create: () => ({}) };
  const buildClient = () => ({});
  request.create();
  buildClient();
}
