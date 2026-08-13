import { definePlugin } from "@oxlint/plugins";

import hoistEffectSchemaCompilers from "./rules/hoist-effect-schema-compilers.ts";
import noClasses from "./rules/no-classes.ts";
import noExpectTypeOf from "./rules/no-expect-type-of.ts";
import noHardcodedBackendHost from "./rules/no-hardcoded-backend-host.ts";
import noMutableModuleStateInServerCode from "./rules/no-mutable-module-state-in-server-code.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "hoist-effect-schema-compilers": hoistEffectSchemaCompilers,
    "no-classes": noClasses,
    "no-expect-type-of": noExpectTypeOf,
    "no-hardcoded-backend-host": noHardcodedBackendHost,
    "no-mutable-module-state-in-server-code": noMutableModuleStateInServerCode,
  },
});
