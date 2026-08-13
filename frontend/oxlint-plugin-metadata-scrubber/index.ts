import { definePlugin } from "@oxlint/plugins";

import hoistEffectSchemaCompilers from "./rules/hoist-effect-schema-compilers.ts";
import noClasses from "./rules/no-classes.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "no-classes": noClasses,
    "hoist-effect-schema-compilers": hoistEffectSchemaCompilers,
  },
});
