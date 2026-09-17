# Name modules for their runtime target

Scope: ordinary module names, server-only wrappers, and imports under `src/`.

Why: names and server-only wrappers separate runtime targets without changing framework file conventions.

## Do's

### Use module suffixes without renaming framework routes or database exceptions

Use `.mod.ts` for ordinary modules, `.mod.tsx` for modules with JSX, and `.mod.server.ts` for server-only modules. Route and entry files keep framework names. These database files intentionally omit `.mod`: `database.constants.server.ts`, `database.relations.server.ts`, and `database.schema.server.ts`. `database.mod.server.ts` keeps it.

```text
src/shared/libs/ky/http-client.mod.server.ts
src/shared/libs/trpc/client/client.mod.tsx
src/domains/wizard/constants/wizard.mod.ts
src/routes/index.tsx
src/routes/api/trpc.$.ts
src/shared/database/database.schema.server.ts
```

### Wrap server-only functions with createServerOnlyFn

The existing app-bindings module uses its request store and invariant helper:

```ts
export const getAppBindings = createServerOnlyFn(() => {
  const store = AppBindingsStore.getStore();
  invariant(store != null, "Failed to retrieve app bindings store");
  return store;
});
```

Import `createServerOnlyFn` from `@tanstack/react-start`.

### Separate type imports and preserve aliases and initialization

Use the `#/` alias for imports from `src/`. Keep types in standalone `import type` declarations, even for the same module as a runtime import. Preserve imported names and local aliases. Use one sorted declaration for each import kind:

```ts
import type { KyInstance as Client, RetryOptions } from "ky";
import ky, { HTTPError } from "ky";
```

A runtime binding named `type` is still a runtime import. Retain an existing side-effect import when initialization is required; do not remove it when moving the last runtime binding to `import type`.

## Don'ts

### Do not keep inline type specifiers or erase their aliases

These imports come from the negative fixture, including the all-type declaration:

```ts
import ky, {
  HTTPError,
  type KyInstance,
  type RetryOptions,
  type ShouldRetryState,
} from "ky";
import { HTTPError as RequestError, type KyInstance as Client } from "ky";
import { type ShouldRetryState as InlineState } from "ky";
```
