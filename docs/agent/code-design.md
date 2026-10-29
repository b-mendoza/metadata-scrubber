# Code design

Use these general design practices in every service and language. For facts, the code is the source of truth.

## Construction over validation

- Build a structured value when one part of it can vary. Accept the variable part as input. Keep the fixed parts in code. Check whether construction can remove a state before you add a check for it. When construction removes an invalid state, delete its checker and rejection tests.

```go
endpoint := url.URL{Scheme: "https", Host: c.R2AccountID + ".r2.cloudflarestorage.com"}
return endpoint.String()
```

Do not join URL text:

```go
return "https://" + c.R2AccountID + ".r2.cloudflarestorage.com"
```

- Check external input before use. Match each check to the input's meaning and risk. A format check does not prove that a resource exists or that access is allowed. Check an input-selected destination before you send trusted data to it.

## Decisions

- Make each decision in one place. Remove a guard or configuration site if another one enforces the same decision. No test can detect the loss of a duplicate guard because its removal changes no behavior.

## Comments

- Use a comment to explain a reason that the code cannot express. The reason can be a limit, a trade-off, or a rule the types cannot state. Do not use a comment to narrate code behavior or change history. Put change notes such as "removed X" and "now uses Y instead" in the commit message.

```ts
// The configuration is fixed for each deployment, so client navigation
// does not load it again.
staleTime: Infinity,
```

Do not narrate the next line:

```ts
// Set staleTime to Infinity.
staleTime: Infinity,
```

## Dependency injection

- Read dependencies through request-scoped application bindings. Do not store dependencies in mutable module-level state.

```ts
const { httpClient } = getAppBindings();
```

Do not keep a shared client on the module:

```ts
export const httpClient = ky.create({ prefixUrl: process.env.BACKEND_URL });
```
