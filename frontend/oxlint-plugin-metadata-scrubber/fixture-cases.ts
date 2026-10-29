type FixtureCase = readonly [
  ruleId: string,
  fixtureFile: string,
  expectedNegativeMessages: readonly string[],
];

const NO_CLASSES_GUIDANCE =
  "Replace it with plain functions and objects. Use a factory function such as `const createService = () => ({ run: () => true })` when code must create an object. Plain functions and objects keep dependencies and mutable state explicit. The rule has no class exceptions, including classes that extend `Error`.";
const NO_EXPECT_TYPE_OF_GUIDANCE =
  "Remove this assertion. Put the expected type on the production declaration with `: ExpectedType`, or constrain the value with `satisfies ExpectedType`. TypeScript checks this contract during the type check. Use Vitest `expect(...)` only for runtime behavior.";
const NO_LIFECYCLE_HOOK_NAMES_GUIDANCE =
  "Name the hook for the external system it keeps in sync, for example `useUppyDashboard`.";
const NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE =
  "Move request-local mutation into request scope. Put request dependencies in `appBindingsMiddleware` and read them with `getAppBindings()`. Use `const` only when no request changes the value or its contents. Do not move the mutation into a module-scope object or array.";
const NO_SILENT_TEST_PREREQUISITE_GUIDANCE =
  "Remove `.skip` so the suite or test runs. Assert each test prerequisite with a Vitest `expect` assertion inside the test callback. Do not replace `.skip` with `.todo` or another disabled-test API. Disabled tests hide missing setup and let CI pass without required coverage. Import `expect` from `vitest` when the test file does not import it.";
const SEPARATE_TYPE_IMPORTS_GUIDANCE =
  'Preserve each imported name and local alias. Keep runtime bindings in a separate import declaration. Type imports disappear from JavaScript. If no runtime import remains, keep a side-effect import when module initialization is required. Ky example: `import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";` and `import ky, { HTTPError } from "ky";`.';
const USE_EFFECT_IN_CUSTOM_HOOK_GUIDANCE =
  "Effects synchronize with external systems. Calculate derived values during render and handle user actions in event handlers. If external synchronization is necessary, put its setup and cleanup in a purpose-named hook such as `useUppyInstance`. Do not hide it in `useMount` or `useUnmount`. Read https://react.dev/learn/you-might-not-need-an-effect.";
const USE_SHARED_RENDER_HELPER_GUIDANCE =
  "Import `renderComponent` from `#/tests/utils/renderers/renderers.mod` and call `renderComponent(jsx)`. The helper runs `userEvent.setup()` and returns the Testing Library result with `user`. Use the returned `user` for interactions. Do not bypass the helper with another import form.";

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
    "no-expect-type-of",
    "no-expect-type-of.test.ts",
    [
      `\`assertType(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
      `\`expectTypeOf(...)\` tests a static type. ${NO_EXPECT_TYPE_OF_GUIDANCE}`,
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
    "no-mutable-module-state-in-server-code",
    "mutable-module-state.server.ts",
    [
      `Concurrent server requests share the module-scope \`let\` state in \`requestCount\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
      `Concurrent server requests share the module-scope \`var\` state in \`requestTotal, requestLabel\`. ${NO_MUTABLE_MODULE_STATE_IN_SERVER_CODE_GUIDANCE}`,
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
      "`Upload` declares a test-local object type. Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.",
      "`ResponseBody` declares a test-local object type. Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.",
      "`Inputs` declares a test-local object type. Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.",
      "`LocalBody` declares a test-local object type. Export a schema-derived type beside its schema, such as `export type X = z.output<typeof xSchema>`, and import it into this test. Do not keep a parallel test-only object type.",
    ],
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
