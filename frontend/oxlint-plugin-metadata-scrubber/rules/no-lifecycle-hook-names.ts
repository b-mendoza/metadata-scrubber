import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { isFunction } from "../utilities.ts";

// A new word excludes state names such as useMountedState and useInitialValue.
const LIFECYCLE_HOOK_NAME_PATTERN =
  /^use(?:Mount|OnMount|Unmount|OnUnmount|DidMount|WillUnmount|EffectOnce|Once|Init|Initialize|FirstRender)(?:[A-Z0-9_]|$)/v;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require custom hook names to describe synchronized work.",
    },
    messages: {
      lifecycleHookName:
        "`{{ hookName }}` describes mount timing instead of synchronized work. Name the hook for the external system it keeps in sync, for example `useUppyDashboard`.",
    },
  },
  create(context) {
    const checkHookName = (node: ESTree.BindingIdentifier): void => {
      if (!LIFECYCLE_HOOK_NAME_PATTERN.test(node.name)) return;
      context.report({
        node,
        messageId: "lifecycleHookName",
        data: { hookName: node.name },
      });
    };

    return {
      FunctionDeclaration(node) {
        if (node.id != null) checkHookName(node.id);
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && isFunction(node.init)) {
          checkHookName(node.id);
        }
      },
    };
  },
});
