import type { Linter } from "eslint";

import { SEVERITY_LEVELS } from "./constants.ts";

const lifecycleHookNamePattern =
  "^use(Mount|OnMount|Unmount|OnUnmount|DidMount|WillUnmount|EffectOnce|Once|Init|Initialize|FirstRender)([A-Z0-9_]|$)";

const restrictedSyntax = [
  {
    selector: "ClassDeclaration, ClassExpression",
    message:
      "This declaration uses class syntax. Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. Plain functions and objects keep dependencies and mutable state explicit. The rule has no class exceptions, including classes that extend `Error`.",
  },
  {
    selector: `FunctionDeclaration[id.name=/${lifecycleHookNamePattern}/], VariableDeclarator[id.type='Identifier'][id.name=/${lifecycleHookNamePattern}/][init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]`,
    message:
      "This hook name describes mount timing instead of synchronized work. Name the hook for the external system it keeps in sync, for example `useUppyDashboard`.",
  },
  {
    selector: "SwitchStatement",
    message: "Use a lookup map that raises an error for unknown keys instead.",
  },
  {
    selector: "ImportExpression[source.value='@tanstack/react-query']",
    message:
      "Import @tanstack/react-query statically with named imports. A dynamic import exposes useQuery and hides it from the import restriction.",
  },
  {
    selector:
      "CallExpression[callee.type=/^(FunctionExpression|ArrowFunctionExpression)$/]",
    message:
      "An immediately invoked function hides a one-off operation behind an anonymous call. Declare a named function, then call that name. Keep anonymous callbacks inline only when you pass or store them.",
  },
];

export const syntaxRules = {
  "no-restricted-syntax": [SEVERITY_LEVELS.Error, ...restrictedSyntax],
  "no-undefined": SEVERITY_LEVELS.Error,
  "object-shorthand": SEVERITY_LEVELS.Error,
} satisfies Linter.RulesRecord;
