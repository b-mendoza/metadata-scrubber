# Construct fixed destinations

Scope: every structured value with fixed parts, including provider URLs and paths.

Why: accepting only the variable part removes destination choices that callers do not need.

## Do's
### Keep the destination fixed and encode the variable path segment

General fixed-provider example:

```ts
const PROVIDER_ORIGIN = "https://api.example.com";

export const inspectionUrl = (accountId: string) => {
  if (accountId.trim() === "" || accountId === "." || accountId === "..") {
    throw new Error("account identifier must be a non-blank path segment");
  }
  return `${PROVIDER_ORIGIN}/accounts/${encodeURIComponent(accountId)}/inspect`;
};
```

The caller cannot select another origin. Encoding prevents path separators, queries, and fragments in the identifier from becoming URL structure. The dot-segment check prevents path normalization from changing the route. Construction does not remove every syntax or identifier check. For a fixed file path, accept the name and keep the directory fixed; preserve the required path-safety checks.

## Don'ts
### Do not accept a whole destination when only an identifier can vary

```ts
export const inspectionUrl = (rawUrl: string) => {
  const url = new URL(rawUrl);
  if (url.origin !== "https://api.example.com") {
    throw new Error("host not allowed");
  }
  return url.toString();
};
```

Check whether construction removes the unwanted state before adding a validator. Delete validators and rejection tests only for states construction makes impossible. Keep checks for the remaining variable input, especially when it controls where trusted data goes.
