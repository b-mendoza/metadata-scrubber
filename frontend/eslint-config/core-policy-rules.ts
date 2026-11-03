import { builtinRules } from "eslint/use-at-your-own-risk";

import { PLUGIN_NAMES } from "./constants.ts";

// eslint-disable-next-line @typescript-eslint/no-deprecated -- ESLint exposes the original core rule objects only through this map. Scoped aliases need those objects.
const coreRules = builtinRules;

const restrictedSyntaxRule = coreRules.get("no-restricted-syntax");
const restrictedImportsRule = coreRules.get("no-restricted-imports");
if (restrictedSyntaxRule == null || restrictedImportsRule == null) {
  throw new Error(
    "ESLint must provide no-restricted-syntax and no-restricted-imports for the scoped core policies.",
  );
}

const corePolicyPlugin = {
  meta: {
    name: PLUGIN_NAMES.CorePolicy,
  },
  rules: {
    "server-try-catch": restrictedSyntaxRule,
    "test-instanceof-assertion": restrictedSyntaxRule,
    "rule-contract": restrictedSyntaxRule,
    "e2e-network-mock": restrictedSyntaxRule,
    "playwright-web-server": restrictedSyntaxRule,
    "server-module-state": restrictedSyntaxRule,
    "test-object-type": restrictedSyntaxRule,
    "module-file-name": restrictedSyntaxRule,
    "module-jsx": restrictedSyntaxRule,
    "test-type-assertion-import": restrictedImportsRule,
  },
};

export default corePolicyPlugin;
