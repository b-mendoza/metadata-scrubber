import { definePlugin } from "@oxlint/plugins";

import noClasses from "./rules/no-classes.ts";
import noDiscardedResult from "./rules/no-discarded-result.ts";
import noExpectTypeOf from "./rules/no-expect-type-of.ts";
import noLateRequestBodyRead from "./rules/no-late-request-body-read.ts";
import noLifecycleHookNames from "./rules/no-lifecycle-hook-names.ts";
import noModuleScopeHttpClient from "./rules/no-module-scope-http-client.ts";
import noMutableModuleStateInServerCode from "./rules/no-mutable-module-state-in-server-code.ts";
import noQueryClientProps from "./rules/no-query-client-props.ts";
import noSilentTestPrerequisite from "./rules/no-silent-test-prerequisite.ts";
import noTestLocalObjectType from "./rules/no-test-local-object-type.ts";
import prefetchRouteDataWithoutWaiting from "./rules/prefetch-route-data-without-waiting.ts";
import requireBackendRequestSignal from "./rules/require-backend-request-signal.ts";
import requireColocatedTest from "./rules/require-colocated-test.ts";
import requireKyJsonSchema from "./rules/require-ky-json-schema.ts";
import requireModuleFileName from "./rules/require-module-file-name.ts";
import requireRelativeBackendPath from "./rules/require-relative-backend-path.ts";
import requireStrictMswServer from "./rules/require-strict-msw-server.ts";
import separateTypeImports from "./rules/separate-type-imports.ts";
import useEffectInCustomHook from "./rules/use-effect-in-custom-hook.ts";
import useSharedRenderHelper from "./rules/use-shared-render-helper.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "no-classes": noClasses,
    "no-discarded-result": noDiscardedResult,
    "no-expect-type-of": noExpectTypeOf,
    "no-late-request-body-read": noLateRequestBodyRead,
    "no-lifecycle-hook-names": noLifecycleHookNames,
    "no-module-scope-http-client": noModuleScopeHttpClient,
    "no-mutable-module-state-in-server-code": noMutableModuleStateInServerCode,
    "no-query-client-props": noQueryClientProps,
    "no-silent-test-prerequisite": noSilentTestPrerequisite,
    "no-test-local-object-type": noTestLocalObjectType,
    "prefetch-route-data-without-waiting": prefetchRouteDataWithoutWaiting,
    "require-backend-request-signal": requireBackendRequestSignal,
    "require-colocated-test": requireColocatedTest,
    "require-ky-json-schema": requireKyJsonSchema,
    "require-module-file-name": requireModuleFileName,
    "require-relative-backend-path": requireRelativeBackendPath,
    "require-strict-msw-server": requireStrictMswServer,
    "separate-type-imports": separateTypeImports,
    "use-effect-in-custom-hook": useEffectInCustomHook,
    "use-shared-render-helper": useSharedRenderHelper,
  },
});
