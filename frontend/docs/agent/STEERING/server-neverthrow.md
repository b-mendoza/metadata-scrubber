# Compose server failures with neverthrow

Scope: all production TypeScript paths that the server can execute, including SSR loaders and isomorphic code. Browser-only handlers, tests, and tooling are outside this rule. Go is unaffected.

Why: explicit result values keep success and failure visible until the framework boundary.

## Do's

### Map failures at the operation and adapt both variants once

Use `Result` or `ResultAsync` for fallible dependency work. Compose with `map`, `andThen`, and `mapErr`. At a tRPC, route, or server-function boundary, return `.match(...)` to adapt both variants to a Promise. Do not use `async/await` in these server-executable paths.

This excerpt replaces `getMessage` in `src/domains/products/products-router.mod.server.ts`. Keep its existing `messageResponseSchema`, `BACKEND_HEALTH_STATUS_ENDPOINT`, `BACKEND_HEALTH_CHECK_FAILURE_MESSAGE`, and `getProducts` entry.

```ts
import { TRPCError } from "@trpc/server";
import { ResultAsync } from "neverthrow";

import {
  createTRPCRouter,
  publicProcedure,
} from "#/shared/libs/trpc/utils/initializer/initializer.mod.server";
import { getAppBindings } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export const productsRouter = createTRPCRouter({
  getMessage: publicProcedure.query(({ signal }) => {
    const { httpClient } = getAppBindings();
    return ResultAsync.fromPromise(
      httpClient
        .get(BACKEND_HEALTH_STATUS_ENDPOINT, { signal: signal ?? null })
        .json(messageResponseSchema),
      (cause) =>
        new TRPCError({
          cause,
          code: "BAD_GATEWAY",
          message: BACKEND_HEALTH_CHECK_FAILURE_MESSAGE,
        }),
    ).match(
      (value) => value,
      (error) => {
        throw error;
      },
    );
  }),
});
```

The operation maps HTTP, JSON, and schema failures to a safe `TRPCError` with the original `cause`. The boundary throws that mapped error, not its raw message. Do not discard a synchronous `Result` or the inner result of a `ResultAsync`. A Promise lint check does not prove that both variants were consumed.

**Current lint conflict:** Oxlint's configured `typescript/promise-function-async` rule requires `async` on Promise-returning functions, including these non-async `ResultAsync.match` boundary adapters. These examples follow the server policy but currently fail that lint rule. Report the conflict; do not add `async`, suppress the rule, or disguise the return type. Resolving the configuration conflict requires a separately authorized change.

### Let synchronous input validation throw

Deliberate synchronous validation throws and safe error mapping are allowed. A server-function validator must return validated input or throw. It must not return an error value as input. This validator-only example uses the existing upload schema.

```ts
import { createServerFn } from "@tanstack/react-start";

import { uploadInputSchema } from "#/domains/wizard/wizard-contracts.mod.server";

export const validateUpload = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadInputSchema.parse(data))
  .handler(({ data }) => data);
```

## Don'ts

### Do not add async or await to a server-executable path

This `getProducts` resolver excerpt uses the product module's existing `setTimeout` import and constants. Even an `async` function with no `await` violates the rule.

```ts
publicProcedure.query(async () =>
  setTimeout(PRODUCTS_RESPONSE_DELAY_MS, PRODUCTS),
);
```

### Do not let a validator pass an error result to its handler

Returning `safeParse` makes failure a normal input value. The handler runs even when validation fails. Use `parse` above, or consume both variants of Result-based validation and return validated input on success or throw the mapped error on failure. Never return a failed validation result as ordinary input. Do not add an Effect library.

```ts
import { createServerFn } from "@tanstack/react-start";

import { uploadInputSchema } from "#/domains/wizard/wizard-contracts.mod.server";

export const validateUpload = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadInputSchema.safeParse(data))
  .handler(({ data }) => data.success);
```
