import request from "ky";
import * as kyModule from "ky";
import { createHttpClient as buildClient } from "#/shared/libs/ky/http-client.mod.server";
import * as workflow from "#/shared/libs/ky/workflow-http-client.mod.server";

declare const baseUrl: URL;
declare const enabled: boolean;

const client = request.create({});
export const extended = request.extend({});
const alias = request;
const fromAlias = alias.create({});
const fromFactory = buildClient(baseUrl);
const buildAgain = buildClient;
const fromFactoryAlias = buildAgain(baseUrl);
const fromNamespace = workflow.createWorkflowHttpClient(baseUrl);
const fromDefaultNamespace = kyModule.default.create({});
if (enabled) {
  request.extend({});
}
export {
  client,
  fromAlias,
  fromFactory,
  fromFactoryAlias,
  fromNamespace,
  fromDefaultNamespace,
};

const { create: makeClient } = request;
export const extractedClient = makeClient({});
