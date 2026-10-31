import request from "ky";
import * as kyModule from "ky";
import { createHttpClient as buildClient } from "#/shared/libs/ky/http-client.mod.server";
import * as workflow from "#/shared/libs/ky/workflow-http-client.mod.server";

declare const baseUrl: URL;

export const extended = request.extend({});
const alias = request;
const fromAlias = alias.create({});
const fromFactory = buildClient(baseUrl);
const fromNamespace = workflow.createWorkflowHttpClient(baseUrl);
const fromDefaultNamespace = kyModule.default.create({});
export { fromAlias, fromFactory, fromNamespace, fromDefaultNamespace };

const { create: makeClient } = request;
export const extractedClient = makeClient({});
