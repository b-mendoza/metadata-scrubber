# Verify opaque identifiers with their owner

Scope: external identifiers and application-owned identifier contracts.

Why: a format check cannot prove that an identifier names the intended resource. An explicit wire grammar still needs validation.

## Do's
### Distinguish opaque provider identifiers from application-owned wire values

```text
Opaque provider bucket or account identifier:
Require presence and a non-blank value. Construct the fixed destination.
Let the owning system verify the resource on first use.

Application-owned wire values:
Require storageKey to match uploads/ followed by a lowercase UUIDv4.
Require the canonical source etag to contain 32 lowercase hexadecimal characters.
These are explicit backend contracts, not guessed provider formats.
```

Before adding stronger checks to an opaque identifier, check whether construction removes the need. Apply stronger checks when input controls the destination for trusted data, such as the host that receives credentials.

## Don'ts
### Do not invent provider grammars or discard explicit application grammars

```text
Incorrect opaque-ID validation:
Reject a provider account identifier because it does not match a guessed local regex.
Assume a matching identifier proves that the account is the intended resource.

Incorrect wire validation:
Accept any non-blank storageKey or etag because all identifiers are opaque.
```

Validate app-owned wire syntax at the boundary. Let the resource owner check identity and access on use.
