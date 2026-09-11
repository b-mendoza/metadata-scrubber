import * as Query from "@tanstack/react-query";
import type * as QueryTypes from "@tanstack/react-query";
import type { useQuery as ImportedQuery } from "@tanstack/react-query";
import {
  type useQuery as InlineImportedQuery,
  useInfiniteQuery,
  useQueries,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState as useQuery } from "react";

export type { useQuery as ExportedQueryType } from "@tanstack/react-query";
export {
  type useQuery as InlineExportedQueryType,
  useSuspenseQuery as explicitAllowedQuery,
  useQueries as explicitAllowedQueries,
  useInfiniteQuery as explicitAllowedInfiniteQuery,
} from "@tanstack/react-query";
export type * from "@tanstack/react-query";
export type * as queryTypes from "@tanstack/react-query";
export { useState as unrelatedExportQuery } from "react";
export * from "neverthrow";
export * as unrelatedExports from "neverthrow";
export { useQuery };

export type ImportedQueryFunction = typeof ImportedQuery;
export type InlineImportedQueryFunction = typeof InlineImportedQuery;
export type TypeNamespaceQueryFunction = typeof QueryTypes.useQuery;
export type RuntimeNamespaceQueryFunction = typeof Query.useQuery;
export type IndexedQueryFunction = (typeof Query)["useQuery"];
export type ImportExpressionQueryFunction =
  typeof import("@tanstack/react-query").useQuery;

export const keepQueryContract = (
  query: typeof Query.useQuery,
): typeof Query.useQuery => query;

export const allowedNamedApis = {
  useQueries,
  useInfiniteQuery,
  useSuspenseQuery,
  useSuspenseQueries,
  useSuspenseInfiniteQuery,
};
export const allowedNamespaceApis = {
  queries: Query.useQueries,
  infinite: Query["useInfiniteQuery"],
  suspense: Query.useSuspenseQuery,
  suspenseQueries: Query.useSuspenseQueries,
  suspenseInfinite: Query.useSuspenseInfiniteQuery,
  client: Query.useQueryClient,
  resetBoundary: Query.QueryErrorResetBoundary,
  resetHook: Query.useQueryErrorResetBoundary,
};
export const { useQueries: destructuredAllowedQueries } = Query;
export let assignedInfiniteQuery: typeof Query.useInfiniteQuery;
({ ["useInfiniteQuery"]: assignedInfiniteQuery } = Query);

export function SuspenseConsumer() {
  const { data } = useSuspenseQuery({
    queryKey: ["allowed"],
    queryFn: () => "ready",
  });
  return <p>{data}</p>;
}

export function UnrelatedApiConsumer() {
  const [data] = useQuery("unrelated");
  return <p>{data}</p>;
}

export function LocalQueryConsumer() {
  const useQuery = () => "local";
  return <p>{useQuery()}</p>;
}

type LocalNamespace = { readonly useQuery: () => string };
const localNamespace: LocalNamespace = { useQuery: () => "local" };
export const localSavedQuery = localNamespace.useQuery;
export const { useQuery: localDestructuredQuery } = localNamespace;
export let localAssignedQuery: () => string;
({ useQuery: localAssignedQuery } = localNamespace);

export function readParameterShadow(Query: LocalNamespace) {
  const dot = Query.useQuery();
  const computed = Query["useQuery"]();
  const { useQuery: declared } = Query;
  let assigned: () => string;
  ({ useQuery: assigned } = Query);
  return [dot, computed, declared(), assigned()];
}

const namespaceAlias = Query;
export const allowedAliasedQuery = namespaceAlias.useSuspenseQuery;
export function readAliasShadow(namespaceAlias: LocalNamespace) {
  return namespaceAlias.useQuery();
}

export function readLocalAlias(Query: LocalNamespace) {
  const firstAlias = Query;
  const secondAlias = firstAlias;
  const { useQuery: declared } = secondAlias;
  return [secondAlias.useQuery(), declared()];
}

export function readBlockShadow() {
  {
    const Query = localNamespace;
    return Query.useQuery();
  }
}

export function readVarShadow() {
  var Query = localNamespace;
  return Query.useQuery();
}

export const readDynamicMember = (name: "useQuery" | "useSuspenseQuery") =>
  Query[name];

export const allowedTemplateMember = Query[`useSuspenseQuery`];
export const { [`useSuspenseQuery`]: allowedTemplateDeclared } = Query;
export let allowedTemplateAssigned: typeof Query.useSuspenseQuery;
({ [`useSuspenseQuery`]: allowedTemplateAssigned } = Query);

export const allowedLiteralKey = Query["useSuspenseQuery" as const];
export const { ["useQueries" as const]: allowedLiteralDeclared } = Query;
export let allowedLiteralAssigned: typeof Query.useInfiniteQuery;
({ ["useInfiniteQuery" as const]: allowedLiteralAssigned } = Query);

export const allowedTemplateKey = Query[`useSuspenseQuery` satisfies string];
export const { [`useQueries` satisfies string]: allowedWrappedDeclared } =
  Query;
export let allowedWrappedAssigned: typeof Query.useInfiniteQuery;
({ [`useInfiniteQuery` satisfies string]: allowedWrappedAssigned } = Query);

export function readFixedKeyValueShadow(Query: LocalNamespace) {
  const shadowAlias = Query;
  const member = Query[`useQuery`];
  const aliasMember = shadowAlias["useQuery" as const];
  const { [`useQuery` satisfies string]: declared } = Query;
  let assigned: () => string;
  ({ ["useQuery" as const]: assigned } = shadowAlias);
  return { member, aliasMember, declared, assigned };
}

export function readAssertedDynamicKey(key: "useQuery" | "useSuspenseQuery") {
  const member = Query[key as "useQuery"];
  const { [key as "useQuery"]: declared } = Query;
  let assigned: typeof Query.useQuery;
  ({ [key as "useQuery"]: assigned } = Query);
  return { member, declared, assigned };
}

export const readDynamicTemplate = (suffix: "Query" | "SuspenseQuery") =>
  Query[`use${suffix}`];

export function readSwitchRuntimeShadow(Query: LocalNamespace) {
  switch (Query.useQuery) {
    default:
      return Query["useQuery" as const]();
  }
}

export function readSwitchCaseBody() {
  switch (Query.useSuspenseQuery) {
    default:
      const Query = localNamespace;
      const caseAlias = Query;
      return caseAlias[`useQuery`]();
  }
}
