import * as Query from "@tanstack/react-query";
import * as SavedQuery from "@tanstack/react-query";
import * as TypeAliasQuery from "@tanstack/react-query";
import * as TypeParameterQuery from "@tanstack/react-query";
import {
  useQuery,
  useQuery as useRenamedQuery,
  "useQuery" as useQuotedQuery,
  type useQuery as MixedQueryType,
  useSuspenseQuery,
} from "@tanstack/react-query";

import * as OtherQuery from "../positive/no-use-query";
import { useQuery as useOtherQuery } from "../positive/no-use-query";

export { useQuery } from "@tanstack/react-query";
export { useQuery as exportedQuery } from "@tanstack/react-query";
export { "useQuery" as quotedExportQuery } from "@tanstack/react-query";
export {
  type useQuery as ExportedQueryType,
  useQuery as mixedExportQuery,
  useSuspenseQuery as allowedExportQuery,
} from "@tanstack/react-query";
export * from "@tanstack/react-query";
export * as allQueryApis from "@tanstack/react-query";
export { useQuery as otherExportQuery } from "../positive/no-use-query";

export type MixedImportQuery = typeof MixedQueryType;
export type RuntimeNamespaceQuery = typeof Query.useQuery;
export const otherNamespaceQuery = OtherQuery.useQuery;
export const otherImportedQuery = useOtherQuery;

export function NamedImportConsumer() {
  const direct = useQuery({ queryKey: ["direct"], queryFn: () => "direct" });
  const repeated = useQuery({
    queryKey: ["repeated"],
    queryFn: () => "repeated",
  });
  const renamed = useRenamedQuery({
    queryKey: ["renamed"],
    queryFn: () => "renamed",
  });
  const quoted = useQuotedQuery({
    queryKey: ["quoted"],
    queryFn: () => "quoted",
  });
  return <p>{direct.data ?? repeated.data ?? renamed.data ?? quoted.data}</p>;
}

export function useNamespaceQuery() {
  return Query.useQuery({ queryKey: ["namespace"], queryFn: () => "ready" });
}

export const computedSavedQuery = Query["useQuery"];
export const savedQuery = SavedQuery.useQuery;
export const optionalSavedQuery = Query?.useQuery;

const alias = Query;
export const aliasedQuery = alias.useQuery;

const chainOne = Query;
const chainTwo = chainOne;
const chainThree = chainTwo;
const chainFour = chainThree;
const chainFive = chainFour;
const chainSix = chainFive;
export const chainedQuery = chainSix.useQuery;

const asAlias = Query as typeof Query;
export const asAliasedQuery = asAlias.useQuery;
const satisfiesAlias = Query satisfies typeof Query;
export const satisfiesAliasedQuery = satisfiesAlias.useQuery;
const nonNullAlias = Query!;
export const nonNullAliasedQuery = nonNullAlias.useQuery;

export const asReceiverQuery = (Query as typeof Query).useQuery;
export const satisfiesQuery = (Query satisfies typeof Query)["useQuery"];
export const nonNullReceiverQuery = Query!.useQuery;

const wrappedCallNamespace = Query;
export function useWrappedQuery() {
  return (wrappedCallNamespace.useQuery as typeof Query.useQuery)({
    queryKey: ["wrapped"],
    queryFn: () => "wrapped",
  });
}

const genericNamespace = Query;
export const specializedQuery = genericNamespace.useQuery<string>;

export const { useQuery: declaredQuery } = Query;
export const { ["useQuery"]: computedDeclaredQuery } = Query;
export const { useQuery: defaultDeclaredQuery = useSuspenseQuery } = Query;
export let { useQuery: letDeclaredQuery } = Query;
export var { useQuery: varDeclaredQuery } = Query;
export const { useQuery: aliasDeclaredQuery } = chainSix;
export const { useQuery: wrappedDeclaredQuery } = Query as typeof Query;

export function useShorthandDeclaration() {
  const { useQuery } = Query;
  return useQuery({ queryKey: ["shorthand"], queryFn: () => "shorthand" });
}

export let assignedQuery: typeof Query.useQuery;
({ useQuery: assignedQuery } = Query);
export let computedAssignedQuery: typeof Query.useQuery;
({ ["useQuery"]: computedAssignedQuery } = chainSix);
export let defaultAssignedQuery: typeof Query.useQuery;
({ useQuery: defaultAssignedQuery = useRenamedQuery } = Query);
export let wrappedAssignedQuery: typeof Query.useQuery;
({ useQuery: wrappedAssignedQuery } = Query satisfies typeof Query);

export function useShorthandAssignment() {
  let useQuery: typeof Query.useQuery;
  ({ useQuery } = alias);
  return useQuery({ queryKey: ["assigned"], queryFn: () => "assigned" });
}

const outerAlias = Query;
export function useAliasUnderShadow(Query: { readonly label: string }) {
  const result = outerAlias.useQuery({
    queryKey: [Query.label],
    queryFn: () => Query.label,
  });
  return result;
}

export function readTypeAliasShadow() {
  type TypeAliasQuery = string;
  const input: TypeAliasQuery = "local type";
  const direct = TypeAliasQuery.useQuery;
  const typeShadowAlias = TypeAliasQuery;
  const aliased = typeShadowAlias.useQuery;
  const { useQuery: typeAliasDeclared } = TypeAliasQuery;
  let typeAliasAssigned: typeof TypeAliasQuery.useQuery;
  ({ useQuery: typeAliasAssigned } = TypeAliasQuery);
  return { input, direct, aliased, typeAliasDeclared, typeAliasAssigned };
}

export function readTypeParameterShadow<
  TypeParameterQuery extends { readonly label: string },
>(input: TypeParameterQuery) {
  const direct = TypeParameterQuery.useQuery;
  const parameterShadowAlias = TypeParameterQuery;
  const aliased = parameterShadowAlias.useQuery;
  const { useQuery: typeParameterDeclared } = TypeParameterQuery;
  let typeParameterAssigned: typeof TypeParameterQuery.useQuery;
  ({ useQuery: typeParameterAssigned } = TypeParameterQuery);
  return {
    input,
    direct,
    aliased,
    typeParameterDeclared,
    typeParameterAssigned,
  };
}

export const templateMember = Query[`useQuery`];
export const aliasTemplateMember = chainSix[`useQuery`];
export const { [`useQuery`]: templateDeclared } = Query;
export let templateAssigned: typeof Query.useQuery;
({ [`useQuery`]: templateAssigned } = chainSix);

export const assertedKeyMember = Query["useQuery" as const];
export const { ["useQuery" as const]: assertedKeyDeclared } = Query;
export let assertedKeyAssigned: typeof Query.useQuery;
({ ["useQuery" as const]: assertedKeyAssigned } = Query);

export const satisfiesKeyMember = Query[`useQuery` satisfies string];
export const { [`useQuery` satisfies string]: satisfiesKeyDeclared } = Query;
export let satisfiesKeyAssigned: typeof Query.useQuery;
({ [`useQuery` satisfies string]: satisfiesKeyAssigned } = Query);

export const nonNullKeyMember = Query[(`useQuery` as const)!];

export function readDirectSwitch() {
  switch (SavedQuery["useQuery"]) {
    default:
      return SavedQuery[`useQuery` satisfies string];
  }
}

const switchAlias = chainSix;
export function readAliasSwitch() {
  switch (switchAlias.useQuery) {
    default:
      return "alias discriminant";
  }
}

export function readDiscriminantOutsideCaseBinding() {
  switch (SavedQuery[`useQuery`]) {
    default:
      const SavedQuery = { useQuery: () => "local case binding" };
      return SavedQuery["useQuery" as const]();
  }
}
