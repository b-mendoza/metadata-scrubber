# Make a lint diagnostic teach the fix

Scope: every lint rule or static check that this repo owns.

Why: a diagnostic that names the cause and required fix lets the reader correct the code.

## Do's
### Identify the problem and explain the required structural fix

Make each message descriptive, actionable, and educational. Use a small correct example. This example describes the existing separate-type-imports rule.

```text
Move inline type bindings to a separate `import type` declaration.
Preserve imported names and local aliases. Keep runtime imports separate.
Type imports disappear from JavaScript. Keep a side-effect import if initialization is required.
Example: import type { KyInstance } from "ky";
```

## Don'ts
### Do not give an unhelpful message or teach a bypass

```text
Invalid import. Fix it.
Add eslint-disable-next-line to silence this error.
```
