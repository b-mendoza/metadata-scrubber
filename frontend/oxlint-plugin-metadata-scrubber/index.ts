import { definePlugin } from "@oxlint/plugins";

import noClasses from "./rules/no-classes.ts";
import noExpectTypeOf from "./rules/no-expect-type-of.ts";
import noLifecycleHookNames from "./rules/no-lifecycle-hook-names.ts";
import noMutableModuleStateInServerCode from "./rules/no-mutable-module-state-in-server-code.ts";
import noSilentTestPrerequisite from "./rules/no-silent-test-prerequisite.ts";
import noTestLocalObjectType from "./rules/no-test-local-object-type.ts";
import requireModuleFileName from "./rules/require-module-file-name.ts";
import separateTypeImports from "./rules/separate-type-imports.ts";
import useEffectInCustomHook from "./rules/use-effect-in-custom-hook.ts";
import useSharedRenderHelper from "./rules/use-shared-render-helper.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "no-classes": noClasses,
    "no-expect-type-of": noExpectTypeOf,
    "no-lifecycle-hook-names": noLifecycleHookNames,
    "no-mutable-module-state-in-server-code": noMutableModuleStateInServerCode,
    "no-silent-test-prerequisite": noSilentTestPrerequisite,
    "no-test-local-object-type": noTestLocalObjectType,
    "require-module-file-name": requireModuleFileName,
    "separate-type-imports": separateTypeImports,
    "use-effect-in-custom-hook": useEffectInCustomHook,
    "use-shared-render-helper": useSharedRenderHelper,
  },
});
