# Current frontend file structure and conventions

> **Short-lived reference.** This file describes the current state of the code. Update it when the code changes. If this file does not match the code, follow the code.

Read the long-lived [TypeScript design conventions](./agent/code-conventions.md) for design guidance. Use this file for current file conventions and fixes for mistakes that agents repeated.

## Imports

- Use the `#/` path alias for imports from `src/`. `tsconfig.app.json` configures this alias.
- Put types in standalone `import type` declarations. Keep runtime bindings in separate declarations, even for the same module.
- Keep each imported name and local alias. A runtime binding named `type` is not a type-only import.
- Move inline type specifiers into a standalone type declaration, even when the original declaration has no runtime bindings. Keep a side-effect import when module initialization is required.

The workflow Ky client uses this split:

```ts
import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
```

## Server code

- Keep the frontend server a thin proxy to the Go backend, as in `src/domains/wizard/wizard-router.mod.server.ts`. Do not add a framework, another validation library, or a shared transport wrapper.
- Create each server dependency per request in `src/shared/middlewares/app-bindings/app-bindings.mod.ts` and read it through `getAppBindings()`. A module-level `const` client also shares state between requests. `no-mutable-module-state-in-server-code` checks only `let` and `var`.
- Preserve timeouts, retry limits, and accepted URL protocols when you replace a validator, client, or transport. Agents lost transport limits and URL protocol checks during replacement. See `src/shared/libs/ky/http-client.mod.server.ts` and `src/shared/config/env/environment.mod.server.ts`.
- Test each timeout and retry limit, and reject each invalid URL protocol. Cover HTTP for local development and HTTPS on Vercel for `BACKEND_URL`.

## Errors and asynchronous code

- Use `neverthrow` only in non-test server-only modules under `src/` with the `.server` suffix and in `scripts/`. Every other non-test file under `src/` can enter the client bundle, even when it contains a server callback. This includes a middleware `.server(...)` callback or a server route handler. Use `async`/`await` in those files. Do not import `neverthrow` in those files. Put server logic that needs `neverthrow` in a `.server` module. See `useUppyInstance` in `src/domains/wizard/components/file-uploader/file-uploader.mod.tsx` for `await createUpload(...)`. See `getMessage` in `src/domains/products/products-router.mod.server.ts` for the server pattern.
- Do not import `neverthrow` in `oxlint-plugin-metadata-scrubber/`. Plugin consumers would need it as a peer dependency.
- Use `async`/`await` in tests. Testing Library needs asynchronous operations.
- Read a Ky error body from `HTTPError.data`, not from `HTTPError.response`. Ky reads the body before it throws. A second read fails in Node. happy-dom hid this failure. See `mapWorkflowRequestFailure` in `src/domains/wizard/wizard-router.mod.server.ts`.

Use the mapped-failure pattern from `getMessage` in `src/domains/products/products-router.mod.server.ts`:

```ts
const backendHealthStatusResult = await ResultAsync.fromPromise(
  httpClient
    .get(BACKEND_HEALTH_STATUS_ENDPOINT, {
      signal: signal ?? null,
    })
    .json(messageResponseSchema),
  (cause: unknown) =>
    new TRPCError({
      cause,
      code: "BAD_GATEWAY",
      message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
    }),
);

if (backendHealthStatusResult.isErr()) {
  throw backendHealthStatusResult.error;
}

return backendHealthStatusResult.value;
```

Apply the following server rules only to non-test `.server` modules under `src/` and to `scripts/`:

- Exempt `scripts/hard-clean.ts` and `scripts/soft-clean.ts` from result-library rules. They import only Node built-ins so both run without `node_modules`, which hard-clean deletes.
- Wrap every asynchronous operation with `ResultAsync.fromPromise`. This includes an operation whose promise the code would otherwise return to the framework. Replace `try`/`catch`, `.then()`, `.catch()`, and raw-promise `await` with this wrapper and an explicit result check, as `getMessage` does in the example above.
- Pass the asynchronous operation as the first argument to `ResultAsync.fromPromise(promise, toMappedError)`. Pass an error mapper as the second argument. Convert the unknown failure to a known error value and keep the original failure in `cause`, as `getMessage` does above.
- Await only a `ResultAsync` to read its `Result`. Branch with `isErr()` or `isOk()`. Throw the mapped error at a route or tRPC boundary, as `getMessage` does above.
- Wrap a synchronous call that can throw with `fromThrowable(fn, toMappedError)` or `Result.fromThrowable(fn, toMappedError)`. Map the failure to a known error value with the original failure in `cause`, then branch with `isErr()` or `isOk()`.
- Wrap a direct synchronous Zod `schema.parse(...)` with `fromThrowable`. Alternatively, use `safeParse` and branch on `success`, as `mapWorkflowRequestFailure` does in `src/domains/wizard/wizard-router.mod.server.ts`. Keep framework-owned tRPC `.input(schema)` and Ky `.json(schema)` arguments unchanged because these APIs handle validation failures.
- Mark a function `async` only where lint requires it. `typescript/promise-function-async` and `typescript/require-await` define these requirements. See `getMessage` above.

| API | Use it when | Example |
| --- | --- | --- |
| `ResultAsync.fromPromise` | Map a promise rejection to a known error value with the original failure in `cause`. | `src/domains/products/products-router.mod.server.ts`, `getMessage` |
| `fromThrowable` / `Result.fromThrowable` | Wrap a synchronous call and map its failure. Keep the original failure in `cause`. Both names refer to the same function. | No current example. |
| `ResultAsync.fromPromise(Promise.all(...), toMappedError)` | Run independent asynchronous operations together and map the first rejection. | No current example. |
| `.andThen` | Run the next result-producing operation only after success. | `scripts/check-lint-directives.ts`, `checkFilesForLintDirectives` |
| `errAsync` | Return an error through a `ResultAsync`. | `scripts/check-lint-directives.ts`, `checkFilesForLintDirectives` |
| `isErr()` | Check a result before reading its error or value. | `src/domains/products/products-router.mod.server.ts`, `getMessage` |
| `safeParse` | Validate a value without throwing and branch on `success`. | `src/domains/wizard/wizard-router.mod.server.ts`, `mapWorkflowRequestFailure` |

- Use `ResultAsync.fromPromise` for asynchronous operations. Do not use `ResultAsync.fromThrowable` or `fromAsyncThrowable`. For independent operations, wrap `Promise.all` with `ResultAsync.fromPromise`. Do not use `ResultAsync.combine`. It waits for all inputs and selects errors in input order. Branch with `isErr()` or `isOk()`. Do not use `.match()` or the unwrap methods.

## Route data loading

- Await only critical data in a route loader. Critical data is data that the page cannot render without. Use `await queryClient.query({ ...options, staleTime: "static" })` without `.catch` for this data. Let the router's `errorComponent` handle the failure.
- Do not `await` a non-critical query in a loader. Do not return its promise from the loader. Do not make the loader `async` for it. A loader that waits delays the first byte of server rendering. It also delays each client navigation. The user sees a blank screen or a stalled navigation.
- Start each non-critical query without waiting with `void queryClient.query(options).catch(() => null)`. The [TanStack Query prefetching guide](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration) recommends discarding the promise with `void` and handling its error with `.catch(noop)`. `query` replaces the deprecated `prefetchQuery` method. The `.catch` only stops an unhandled rejection. The consumer reads the query from the cache.
- Use `useSuspenseQuery` by default to read query data. The data is defined when the component renders. `useQuery` is valid only when a use case requires it. The core `no-restricted-imports` and `no-restricted-syntax` entries enforce this policy. Ask the owner before you use it. Do not work around the rule.
- Read non-critical data with `useSuspenseQuery` by default inside a `Suspense` boundary with a `fallback`. The page shows a loading state while the query runs. See the synchronous loader and `IndexRoute` in `src/routes/index.tsx`. The loader starts the health query without waiting. `IndexRoute` has one `Suspense` boundary with a `fallback`.
- Do not handle query loading state inside the component. Do not use pending or loading flags. Do not use nullable-data branches for loading. Put the loading UI in the `fallback` of the parent `Suspense` boundary. `IndexRoute` does this for `Message` in `src/routes/index.tsx`. This keeps the component simple.

This query rule leaves mutation pending state in the component because mutations do not suspend.

## Functions

- Do not write an immediately invoked function, or IIFE. Call a named function, as the module-level loop calls `getDiagnosticMessages` in `oxlint-plugin-metadata-scrubber/check-fixtures.ts`. Anonymous functions are fine as inline callbacks, object fields, or arguments. Pass a named function to `fromThrowable` and call the returned function with the arguments, as `checkLintDirectives` is wrapped in `scripts/check-lint-directives.ts`. Do not wrap an anonymous function and call it on the spot.
- Move a named local function to module scope only when it reads no variable from its enclosing function. This avoids a new function on each call. Keep anonymous callbacks passed as arguments inline. `unicorn/consistent-function-scoping` with `checkArrowFunctions: true` checks local declarations but does not report these callbacks.

## Contracts and validation

- Read the maximum source size from the backend at runtime. Do not add a frontend constant or a `.max()` check for the source size; map the backend's `413` status instead. Agents added frontend copies of the source-size limit several times.
- Reject padding in an exact contract string before the `.trim()` call that `zod/prefer-string-schema-with-trim` requires. Then `.trim()` cannot change an accepted value. Agents trimmed submitted file names and diagnostic strings, which changed values and hid mismatches. See the file-name schema in `src/domains/wizard/wizard-contracts.mod.server.ts`.
- Parse dependency and tool output as `unknown` and validate the documented contract with Zod. See `oxlint-plugin-metadata-scrubber/check-fixtures.ts`.
- Require each field that the documented output always contains, such as `diagnostics` and a positive `number_of_files` in Oxlint output. Do not use casts, `?? []` fallbacks, or guessed formats.

## Tests

- Name a test for server code `*.server.test.ts` so that it runs in Node. `vitest.config.ts` runs `./src/**/*.server.test.ts` and `./scripts/**/*.test.ts` in the `server` project with the `node` environment and no setup file. It runs other `./src/**/*.test.{ts,tsx}` files in the `client` project with `happy-dom` and `src/tests/setup-test-environment.ts`.
- Read or clone a request inside the fetch mock. Ky consumes the request body. A later read fails in Node. See the procedure tests in `src/domains/wizard/wizard-router.mod.server.test.ts`.
- Build request payloads from production input types and response payloads from production output types. Export a schema-derived type next to its schema when a test needs it. `src/domains/wizard/wizard-router-response-validation.mod.server.test.ts` builds its error fixtures from `BackendErrorResponse`.
- Test a tRPC procedure through `createCallerFactory` with the real router type, as `src/domains/wizard/wizard-router.mod.server.test.ts` does. Do not rebuild the caller through reflection.
- Capture an error rejection. Narrow it once with `expect.assert`. Then run each assertion unconditionally. Do not assert inside a `catch` or `instanceof` branch, even in a helper. `vitest/no-conditional-expect` does not check a helper outside a test callback. See `src/domains/products/products-router.mod.server.test.ts`.

## Custom lint rules

The [plugin reference](../oxlint-plugin-metadata-scrubber/README.md) lists all eight rules. ESLint and the fixture config enable all eight at error severity. The main Oxlint config enables all eight at error severity. Agents must leave that file unchanged.

- `use-effect-in-custom-hook` requires `useEffect` calls to belong to named custom hooks. Keep Uppy construction and destruction in `useUppyInstance`. Keep event subscription and Dashboard rendering in `FileUploader`. Remount `FileUploader` to apply changed creation inputs. The rule cannot prove that a `useEffect` call is necessary or that a hook name describes its purpose.
- The core `no-restricted-imports` entry rejects runtime `useQuery` imports and source re-exports from `@tanstack/react-query`. It also rejects runtime namespace imports and wildcard exports from that package. Type-only imports and exports remain allowed. The core `no-restricted-syntax` entry rejects dynamic imports with that literal source. Follow the [route data loading rules](#route-data-loading). Review the actual parent Suspense and error boundaries, route data needs, and retry behavior. Static lint does not prove those runtime properties.
- `separate-type-imports` enforces the import split above. It allows standalone named, default, and namespace type imports.

Run the separate fixture check for these rules. Service lint alone does not run their fixture cases. The plugin reference gives both commands and the static limits.

## File names

- Use `*.mod.ts` and `*.mod.tsx` for module files. Use the `.tsx` extension when a module file contains JSX.
- Use `*.mod.server.ts` for server-only modules such as environment parsing and tRPC routers. The `.server` suffix keeps server code out of client bundles.
- Use `*.test.ts` and `*.test.tsx` for test files.
- Put each test file next to the module that it tests. `vitest.config.ts` includes `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`. Keep test files out of `src/tests/`. Use that directory for setup and shared helpers.

See the [architecture reference](./architecture.md) for the source layout under `src/domains/`, `src/shared/`, and `src/routes/`.

## Lint harness

- Fix the code when a check fails. Keep Vitest failing when it collects no tests. Keep each rule's file scope. Run React Doctor on the full frontend.
- Add a matching lint scope when you add a test category to Vitest discovery. Update `eslint-config/test-rules.js` in the same change.
- `eslint.config.js` loads the policy modules in `eslint-config/`. Keep rule policy in these files.
- See the [commands reference](./commands.md#core-commands) for directive checks.
- `scripts/check-lint-directives.test.ts` tests the directive guard.
