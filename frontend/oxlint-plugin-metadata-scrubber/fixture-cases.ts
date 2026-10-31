type FixtureCase = readonly [
  ruleId: string,
  fixtureFile: string,
  expectedNegativeMessages: readonly string[],
];

const NO_CLASSES_GUIDANCE =
  "Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. Plain functions and objects keep dependencies and mutable state explicit. The rule has no class exceptions, including classes that extend `Error`.";
const NO_DISCARDED_RESULT_GUIDANCE =
  "Assign the result and check `isErr()`. Throw or return the error at the boundary: `const result = await operation(); if (result.isErr()) { throw result.error; } return result.value;`.";
const NO_EXPECT_TYPE_OF_GUIDANCE =
  "Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.";
const NO_LIFECYCLE_HOOK_NAMES_GUIDANCE =
  "Name the hook for the external system it keeps in sync, for example `useUppyDashboard`.";
const NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE =
  "Move request-local mutation into request scope. Put request dependencies in `appBindingsMiddleware` and read them with `getAppBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.";
const NO_QUERY_CLIENT_PROPS_GUIDANCE =
  "In a route file, read `trpc` and `queryClient` with `Route.useRouteContext()`. In a component that lives in its own file, read them with `trpcContext.useTRPC()` and `useQueryClient()` from `@tanstack/react-query`. Remove this prop.";
const NO_SILENT_TEST_PREREQUISITE_GUIDANCE =
  "Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.";
const SEPARATE_TYPE_IMPORTS_GUIDANCE =
  'Preserve each imported name and local alias. Keep runtime bindings in a separate import declaration. Type imports disappear from JavaScript. If no runtime import remains, keep a side-effect import when module initialization is required. Ky example: `import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";` and `import ky, { HTTPError } from "ky";`.';
const USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE =
  "Effects synchronize with external systems. Calculate derived values during render and handle user actions in event handlers. If external synchronization is necessary, put its setup and cleanup in a purpose-named hook such as `useUppyInstance`. Do not hide it in `useMount` or `useUnmount`. Read https://react.dev/learn/you-might-not-need-an-effect.";
const USE_SHARED_RENDER_HELPER_GUIDANCE =
  "Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.";

const NO_LATE_REQUEST_BODY_READ_GUIDANCE =
  "Read or clone it inside the MSW handler and store the value: `const bodies: unknown[] = []; const handler = vi.fn<HttpResponseResolver>(async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(response); });`. Import `vi` from `vitest` and `HttpResponseResolver` and `HttpResponse` from `msw`.";
const NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE =
  "Create clients in `appBindingsMiddleware` for each request and read them with `getAppBindings()`.";
const NO_TEST_LOCAL_OBJECT_TYPE_GUIDANCE =
  "Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.";
const PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE =
  "Do not return the query promise. Await a route query only when a later optional route query needs its result: assign the result to a `const` and pass it to that later query.";
const REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE =
  "Pass the request AbortSignal as `{ signal: signal ?? null }` so request cancellation stops the backend call.";
const REQUIRE_KY_JSON_SCHEMA_GUIDANCE =
  "Pass the Zod response schema with `.json(schema)`. Ky validates the body; do not parse it again later.";
const REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE =
  'App bindings set the base URL; pass a relative path such as `"/api/health"` as the first argument.';

export const fixtureCases: readonly FixtureCase[] = [
  [
    "no-classes",
    "no-classes.ts",
    [
      `\`Service\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
      `\`ServiceExpression\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
      `\`ServiceError\` uses class syntax. ${NO_CLASSES_GUIDANCE}`,
    ],
  ],
  [
    "no-discarded-result",
    "no-discarded-result.server.ts",
    [
      `\`ResultAsync.fromPromise\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`ResultAsync.fromSafePromise\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`Result.fromThrowable\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`ResultAsync.fromThrowable\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`ok\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`safeTry\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`Result.combine\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`AsyncResult.fromPromise\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`success\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`results.ok\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
      `\`results.ResultAsync.combine\` discards a neverthrow result. ${NO_DISCARDED_RESULT_GUIDANCE}`,
    ],
  ],
  [
    "no-expect-type-of",
    "no-expect-type-of.test.ts",
    [
      `\`assertType(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
      `\`expectTypeOf(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
    ],
  ],
  [
    "no-late-request-body-read",
    "no-late-request-body-read.test.ts",
    [
      `\`handler.mock.calls[0]?.[0].request.json()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`handler.mock.lastCall?.[0].request.text()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`handler.mock.calls.at(-1)?.[0].request.formData()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`handlerInfo.request.arrayBuffer()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`saved.blob()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`request.clone()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`input.json()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
      `\`handler.mock.calls[index]?.[0].request.json()\` reads a request body from a Vitest mock record. Ky can consume the body first. ${NO_LATE_REQUEST_BODY_READ_GUIDANCE}`,
    ],
  ],
  [
    "no-lifecycle-hook-names",
    "no-lifecycle-hook-names.ts",
    [
      `\`useMount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnMount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useUnmount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnUnmount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useDidMount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useWillUnmount\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useMountEffect\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useEffectOnce\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnce\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useInit\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useInitialize\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useFirstRender\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useMountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnMountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useUnmountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnUnmountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useDidMountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useWillUnmountUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useMountEffectUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useEffectOnceUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useOnceUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useInitUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useInitializeUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useFirstRenderUploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useMount2\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
      `\`useMount_uploader\` describes mount timing instead of synchronized work. ${NO_LIFECYCLE_HOOK_NAMES_GUIDANCE}`,
    ],
  ],
  [
    "no-module-scope-http-client",
    "no-module-scope-http-client.ts",
    [
      `\`request.create\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`request.extend\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`alias.create\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`buildClient\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`buildAgain\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`workflow.createWorkflowHttpClient\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`kyModule.default.create\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`request.extend\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
      `\`makeClient\` creates an HTTP client at module scope. ${NO_MODULE_SCOPE_HTTP_CLIENT_GUIDANCE}`,
    ],
  ],
  ["no-module-scope-http-client", "no-module-scope-http-client.test.ts", []],
  [
    "no-mutable-module-state-in-server-code",
    "mutable-module-state.server.ts",
    [
      `Concurrent server requests share the module-scope \`let\` state in \`requestCount\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
      `Concurrent server requests share the module-scope \`var\` state in \`requestTotal, requestLabel\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
    ],
  ],
  [
    "no-query-client-props",
    "no-query-client-props.tsx",
    [
      `\`routeRpc\` passes a query client through the \`trpc\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`routeCache\` passes a query client through the \`queryClient\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`routeContext.trpc\` passes a query client through the \`rpc\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`routeContext.queryClient\` passes a query client through the \`cache\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`cache\` passes a query client through the \`cache\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`client\` passes a query client through the \`client\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`alias\` passes a query client through the \`alias\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`readCache()\` passes a query client through the \`direct\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`rpc.useTRPC()\` passes a query client through the \`rpc\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`"wrong"\` passes a query client through the \`trpc\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`null\` passes a query client through the \`queryClient\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`cache\` passes a query client through the \`client\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
      `\`cache\` passes a query client through the \`queryClient\` prop. ${NO_QUERY_CLIENT_PROPS_GUIDANCE}`,
    ],
  ],
  [
    "no-silent-test-prerequisite",
    "no-silent-test-prerequisite.test.ts",
    [
      `\`check.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`describe.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`it.skip\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      `\`test.skip.each([false])\` disables a suite or test. ${NO_SILENT_TEST_PREREQUISITE_GUIDANCE}`,
      "The `!ready` test prerequisite guard uses a bare `return` in `test.each([false])`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect(ready).toBeTruthy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
      "The `value === undefined` test prerequisite guard uses a bare `return` in `test`. This return makes the test pass without its behavior assertions. Replace the guard exit with `expect((value === undefined)).toBeFalsy()`. Then continue the test. Import `expect` from `vitest` when the test file does not import it.",
    ],
  ],
  [
    "no-test-local-object-type",
    "no-test-local-object-type.test.ts",
    [
      `\`Upload\` declares a test-local object type. ${NO_TEST_LOCAL_OBJECT_TYPE_GUIDANCE}`,
      `\`ResponseBody\` declares a test-local object type. ${NO_TEST_LOCAL_OBJECT_TYPE_GUIDANCE}`,
      `\`Inputs\` declares a test-local object type. ${NO_TEST_LOCAL_OBJECT_TYPE_GUIDANCE}`,
      `\`LocalBody\` declares a test-local object type. ${NO_TEST_LOCAL_OBJECT_TYPE_GUIDANCE}`,
    ],
  ],
  [
    "prefetch-route-data-without-waiting",
    "prefetch-route-data-without-waiting.ts",
    [
      `\`cache.query(options)\` waits for route query data. Start it without waiting: \`void cache.query(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`context.queryClient.fetchQuery(options)\` waits for route query data. Start it without waiting: \`void context.queryClient.fetchQuery(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.prefetchQuery(options)\` waits for route query data. Start it without waiting: \`void cache.prefetchQuery(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.fetchInfiniteQuery(infiniteOptions)\` waits for route query data. Start it without waiting: \`void cache.fetchInfiniteQuery(infiniteOptions).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureInfiniteQueryData(infiniteOptions)\` waits for route query data. Start it without waiting: \`void cache.ensureInfiniteQueryData(infiniteOptions).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.prefetchInfiniteQuery(infiniteOptions)\` waits for route query data. Start it without waiting: \`void cache.prefetchInfiniteQuery(infiniteOptions).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      "`cache.query(options)` drops a route query promise without an error handler. Use `void cache.query(options).catch(() => null)`.",
      `\`context.queryClient.query(options)\` waits for route query data. Start it without waiting: \`void context.queryClient.query(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      "`localCache.query(options)` drops a route query promise without an error handler. Use `void localCache.query(options).catch(() => null)`.",
      "`queryClient.query(options)` drops a route query promise without an error handler. Use `void queryClient.query(options).catch(() => null)`.",
      "`queryClient.query(options)` drops a route query promise without an error handler. Use `void queryClient.query(options).catch(() => null)`.",
      `\`queryClient["fetchQuery"](options)\` waits for route query data. Start it without waiting: \`void queryClient["fetchQuery"](options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.query(laterOptions(required))\` waits for route query data. Start it without waiting: \`void cache.query(laterOptions(required)).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      "`cache.query(laterOptions(required))` drops a route query promise without an error handler. Use `void cache.query(laterOptions(required)).catch(() => null)`.",
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
      `\`cache.ensureQueryData(options)\` waits for route query data. Start it without waiting: \`void cache.ensureQueryData(options).catch(() => null)\`. ${PREFETCH_ROUTE_DATA_WITHOUT_WAITING_GUIDANCE}`,
    ],
  ],
  [
    "require-backend-request-signal",
    "require-backend-request-signal.server.ts",
    [
      `\`client.get\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.post\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.put\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.patch\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.delete\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.head\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`readBindings().httpClient.get\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`client.get\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
      `\`alias["get"]\` must pass an options object literal with an explicit \`signal\` property after all spreads. ${REQUIRE_BACKEND_REQUEST_SIGNAL_GUIDANCE}`,
    ],
  ],
  [
    "require-backend-request-signal",
    "backend-request-scope.server.test.ts",
    [],
  ],
  [
    "require-colocated-test",
    "require-colocated-test",
    [
      "`src/a-orphan.mod.test.ts` has no matching source module. Move it beside the module it tests and rename it to start with that module's stem, such as `src/<module>/<module>.mod.test.ts`.",
      "`src/b-wrong-place/c-widget-extra.mod.test.tsx` is not beside `src/c-widget/c-widget.mod.tsx`. Move it to `src/c-widget/c-widget-extra.mod.test.tsx` and update its imports.",
      "`src/d-server/api-split.mod.test.ts` tests server module `src/d-server/api.mod.server.ts`. Rename it to `src/d-server/api-split.mod.server.test.ts` so Vitest uses the node environment.",
      "`src/e-server-tsx/service.mod.server.test.tsx` tests server module `src/e-server-tsx/service.mod.server.ts`. Rename it to `src/e-server-tsx/service.mod.server.test.ts` so Vitest uses the node environment.",
      "`src/routes/-missing.test.tsx` has no matching source module. Move it beside the module it tests and rename it to start with that module's stem, such as `src/routes/-<route>.test.tsx`.",
    ],
  ],
  [
    "require-ky-json-schema",
    "require-ky-json-schema.server.ts",
    [
      `\`client.get\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`alias.post\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`readBindings().httpClient.get\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`request\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`request.get\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`fetchJson.post\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
      `\`kyModule.default\` calls \`.json()\` without a response schema. ${REQUIRE_KY_JSON_SCHEMA_GUIDANCE}`,
    ],
  ],
  [
    "require-module-file-name",
    "require-module-file-name",
    [
      "`src/a-plain.ts` does not use a module file name. Rename it to `src/a-plain.mod.ts` and update its imports.",
      "`src/b-empty.mod.tsx` contains no JSX. Rename it to `src/b-empty.mod.ts` and update its imports.",
      "`src/c-server.mod.server.tsx` does not use a module file name. Rename it to `src/c-server.mod.server.ts` and update its imports.",
      "`src/d-test.mod.test.server.ts` does not use a module file name. Rename it to `src/d-test.mod.server.test.ts` and update its imports.",
      "`src/e-types.d.ts` does not use a module file name. Rename it to `src/e-types.mod.ts` and update its imports.",
      "`src/f-esm.mts` does not use a module file name. Rename it to `src/f-esm.mod.ts` and update its imports.",
      "`src/g-common.cts` does not use a module file name. Rename it to `src/g-common.mod.ts` and update its imports.",
      "`src/nested/router.tsx` does not use a module file name. Rename it to `src/nested/router.mod.tsx` and update its imports.",
      "`src/tests/other-setup.ts` does not use a module file name. Rename it to `src/tests/other-setup.mod.ts` and update its imports.",
      "`src/tests/utils/helper.ts` does not use a module file name. Rename it to `src/tests/utils/helper.mod.ts` and update its imports.",
    ],
  ],
  [
    "require-relative-backend-path",
    "require-relative-backend-path.server.ts",
    [
      `\`client.get\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`client.post\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`client.put\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`client.patch\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`client.delete\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`client.head\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`readBindings().httpClient.get\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
      `\`alias["get"]\` must use a path that starts with a single \`/\`. ${REQUIRE_RELATIVE_BACKEND_PATH_GUIDANCE}`,
    ],
  ],
  ["require-relative-backend-path", "backend-request-scope.server.test.ts", []],
  [
    "require-strict-msw-server",
    "require-strict-msw-server.test.ts",
    [
      '`createServer()` creates an unnamed MSW server. Assign it with `const server = createServer();`. Call `server.listen({ onUnhandledFrame: "error" })`, `server.resetHandlers()` inside an `afterEach` callback, and `server.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`missing` is missing strict MSW lifecycle calls. Call `missing.listen({ onUnhandledFrame: "error" })`, `missing.resetHandlers()` inside an `afterEach` callback, and `missing.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`warning` is missing strict MSW lifecycle calls. Call `warning.listen({ onUnhandledFrame: "error" })`, `warning.resetHandlers()` inside an `afterEach` callback, and `warning.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`warning.listen` does not set `onUnhandledFrame` to `"error"`. Call `warning.listen({ onUnhandledFrame: "error" })`, `warning.resetHandlers()` inside an `afterEach` callback, and `warning.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`outside` is missing strict MSW lifecycle calls. Call `outside.listen({ onUnhandledFrame: "error" })`, `outside.resetHandlers()` inside an `afterEach` callback, and `outside.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`shadowed` is missing strict MSW lifecycle calls. Call `shadowed.listen({ onUnhandledFrame: "error" })`, `shadowed.resetHandlers()` inside an `afterEach` callback, and `shadowed.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`legacy` is missing strict MSW lifecycle calls. Call `legacy.listen({ onUnhandledFrame: "error" })`, `legacy.resetHandlers()` inside an `afterEach` callback, and `legacy.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`legacy.listen` does not set `onUnhandledFrame` to `"error"`. Call `legacy.listen({ onUnhandledFrame: "error" })`, `legacy.resetHandlers()` inside an `afterEach` callback, and `legacy.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`noOptions` is missing strict MSW lifecycle calls. Call `noOptions.listen({ onUnhandledFrame: "error" })`, `noOptions.resetHandlers()` inside an `afterEach` callback, and `noOptions.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
      '`noOptions.listen` does not set `onUnhandledFrame` to `"error"`. Call `noOptions.listen({ onUnhandledFrame: "error" })`, `noOptions.resetHandlers()` inside an `afterEach` callback, and `noOptions.close()` inside an `afterAll` callback. Import the hooks from `vitest`.',
    ],
  ],
  [
    "separate-type-imports",
    "separate-type-imports.ts",
    [
      `Move inline type bindings \`KyInstance, RetryOptions, ShouldRetryState\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
      `Move inline type bindings \`KyInstance as Client\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
      `Move inline type bindings \`KyInstance as AllInlineClient, RetryOptions as AllInlineRetryOptions\` from \`ky\` to a separate \`import type\` declaration. ${SEPARATE_TYPE_IMPORTS_GUIDANCE}`,
    ],
  ],
  [
    "use-effect-in-custom-hook",
    "use-effect-in-custom-hook.tsx",
    [
      `React \`useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`declarationEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`lowercaseEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`React.useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`ReactNamespace["useEffect"]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`FinalNamespace[\`useEffect\`]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`assertedEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`savedEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`passedEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`SavedNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`DestructuredNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`ComputedNamespace["useEffect"]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`TemplateNamespace[\`useEffect\`]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`typeParameterEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`TypeShadowChain.useEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`WrappedLiteralNamespace["useEffect" as const]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`WrappedTemplateNamespace[\`useEffect\` satisfies string]\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`WrappedAssignmentNamespace[\`useEffect\` as const]\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`SourceAndTargetNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`DefaultReadNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`ObjectReadNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`OrAssignmentNamespace.useEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`switchDiscriminantEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`shortNameEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`wrappedOwnerEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `React \`callbackEffect\` is outside a named custom hook. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
      `Do not extract React \`propEffect\`. Call it directly inside a named custom hook. Extraction hides the call owner. ${USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE}`,
    ],
  ],
  [
    "use-shared-render-helper",
    "use-shared-render-helper.test.tsx",
    [
      `Do not use \`render\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`renderAgain\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`pureRender\` from the \`@testing-library/react/pure\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
      `Do not use \`testingLibrary.render\` from the \`@testing-library/react\` package directly. ${USE_SHARED_RENDER_HELPER_GUIDANCE}`,
    ],
  ],
];
