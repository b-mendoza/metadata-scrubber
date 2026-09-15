# Match dependencies to their lifetime

Scope: every service and language.

Why: shared request state can leak between users. Rebuilding process state per request defeats shared limits.

## Do's
### Read request dependencies from bindings and keep intentional shared state at its own lifetime

This lifetime-only excerpt belongs beside the existing `createQueryClient` factory. Keep that factory's options. The holder changes only in the browser branch, not during a server request.

```ts
import type { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";

const browserQueryClient: { current: QueryClient | null } = { current: null };

const initializeQueryClient = createIsomorphicFn()
  .server(() => createQueryClient())
  .client(() => {
    browserQueryClient.current ??= createQueryClient();
    return browserQueryClient.current;
  });
```

A browser `QueryClient` can live for the app lifetime. Backend startup can own a provider and a process-wide permit set, then inject them into request bindings. Check what a cache stores and who can read it before sharing it.

Call `getRouterContext` only during `getRouter` initialization. It creates context; it does not retrieve the current request context. Loaders and handlers must use their existing request context or application bindings.

## Don'ts
### Do not hide shared server request state in a module-level holder

```text
Incorrect server lifetime:
Create one module-level object with currentUser and queryClient fields.
Replace its currentUser for each request and reuse its queryClient for every user.
Read that object instead of the request's application bindings.
```

Honor the service's module-state lint rules even when two forms preserve the same runtime lifetime. Do not reassign a top-level binding to implement the browser holder. A const object is not permission to mutate shared request state on the server.
