import { definePlugin } from "@oxlint/plugins";

import noDiscardedResult from "./rules/no-discarded-result.ts";
import noLateRequestBodyRead from "./rules/no-late-request-body-read.ts";
import noModuleScopeHttpClient from "./rules/no-module-scope-http-client.ts";
import noQueryClientProps from "./rules/no-query-client-props.ts";
import noSilentTestPrerequisite from "./rules/no-silent-test-prerequisite.ts";
import prefetchRouteDataWithoutWaiting from "./rules/prefetch-route-data-without-waiting.ts";
import requireBackendRequestSignal from "./rules/require-backend-request-signal.ts";
import requireColocatedTest from "./rules/require-colocated-test.ts";
import requireKyJsonSchema from "./rules/require-ky-json-schema.ts";
import requireRelativeBackendPath from "./rules/require-relative-backend-path.ts";
import requireStrictMswServer from "./rules/require-strict-msw-server.ts";
import useEffectInCustomHook from "./rules/use-effect-in-custom-hook.ts";
import useSharedRenderHelper from "./rules/use-shared-render-helper.ts";

export default definePlugin({
  meta: {
    name: "metadata-scrubber",
  },
  rules: {
    "no-discarded-result": noDiscardedResult,
    "no-late-request-body-read": noLateRequestBodyRead,
    "no-module-scope-http-client": noModuleScopeHttpClient,
    "no-query-client-props": noQueryClientProps,
    "no-silent-test-prerequisite": noSilentTestPrerequisite,
    "prefetch-route-data-without-waiting": prefetchRouteDataWithoutWaiting,
    "require-backend-request-signal": requireBackendRequestSignal,
    "require-colocated-test": requireColocatedTest,
    "require-ky-json-schema": requireKyJsonSchema,
    "require-relative-backend-path": requireRelativeBackendPath,
    "require-strict-msw-server": requireStrictMswServer,
    "use-effect-in-custom-hook": useEffectInCustomHook,
    "use-shared-render-helper": useSharedRenderHelper,
  },
});
