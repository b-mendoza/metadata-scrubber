import { definePlugin } from "@oxlint/plugins";

import noClasses from "./rules/no-classes.ts";
import noExpectTypeOf from "./rules/no-expect-type-of.ts";
import noHardcodedBackendHost from "./rules/no-hardcoded-backend-host.ts";
import noMutableModuleStateInServerCode from "./rules/no-mutable-module-state-in-server-code.ts";
import noSilentTestPrerequisite from "./rules/no-silent-test-prerequisite.ts";
import useSharedRenderHelper from "./rules/use-shared-render-helper.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "no-classes": noClasses,
    "no-expect-type-of": noExpectTypeOf,
    "no-hardcoded-backend-host": noHardcodedBackendHost,
    "no-mutable-module-state-in-server-code": noMutableModuleStateInServerCode,
    "no-silent-test-prerequisite": noSilentTestPrerequisite,
    "use-shared-render-helper": useSharedRenderHelper,
  },
});
