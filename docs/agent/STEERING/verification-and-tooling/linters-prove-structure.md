# Fix structure first, suppress last

Scope: lint and type errors.

Why: a structural fix removes the cause. A suppression only hides the diagnostic.

## Do's
### Make the required structure explicit so the checker can verify it

For example, move a type-only binding into a standalone import. This synchronous fix needs no `async` or `await`.

```ts
import type { KyInstance } from "ky";
```

Keep a suppression only when an unavoidable third-party API boundary prevents a structural fix. Use the narrowest location. Name the API and explain why the correct structure cannot satisfy the check. That exception does not permit routine lint or type escapes.

## Don'ts
### Do not suppress a failure that has a structural fix

```ts
// eslint-disable-next-line metadata-scrubber/separate-type-imports
import { type KyInstance } from "ky";
```
