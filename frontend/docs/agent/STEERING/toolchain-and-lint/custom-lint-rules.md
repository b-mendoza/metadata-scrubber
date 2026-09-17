# Preserve the custom lint checks

Scope: the nine project lint rules and their configs.

Why: the rules encode project standards, but static checks do not prove every runtime property.

## Do's

### Keep all nine rules active and check their fixtures separately

The [plugin reference](../../../../oxlint-plugin-metadata-scrubber/README.md) lists all nine rules. `eslint.config.js` keeps all nine at error severity, including in the effective ESLint config. The main `.oxlintrc.json` and `fixture.config.json` also enable all nine at error severity. The final ESLint adapter disables supported Oxlint-owned rules, such as `no-floating-promises`, not these custom rules. Leave the main Oxlint config unchanged; the user synchronizes it from ESLint policy. Do not weaken these configs.

From `frontend/`, run the separate fixture check when a rule changes:

```bash
pnpm run lint
node oxlint-plugin-metadata-scrubber/check-fixtures.ts
```

The fixture script uses `fixture.config.json`, checks zero positive diagnostics and exact ordered negative messages, and is not part of `pnpm run lint`.

## Don'ts

### Do not treat lint success as proof that every Result is consumed

Keep `no-floating-promises` with `checkThenables: true`; Oxlint runs its active copy. It catches a bare unawaited `ResultAsync`, not a discarded synchronous `Result` or an awaited `ResultAsync` whose inner `Result` is ignored. Review both gaps by hand. These are wrong consumption examples, not an exception to the [server rule](../server-runtime/server-neverthrow.md):

```ts
import { ok, ResultAsync } from "neverthrow";

ok("discarded synchronous Result");
await ResultAsync.fromSafePromise(Promise.resolve("ignored inner Result"));
```

The evaluated `eslint-plugin-neverthrow@1.1.4` failed against the ESLint API used in that evaluation (`9.39.5`). It is not installed. Revisit a compatible release or another rule that covers these gaps; the rejection is not permanent.
