# Validate inputs at the boundary

Scope: every input that crosses a trust or process boundary, such as an HTTP body or a third-party response.

Why: boundary validation turns unknown data into a checked contract before application code uses it.

## Do's
### Parse unknown data with the strict contract and keep the validated value

This synchronous validation example uses the existing strict upload response schema. The input is already-decoded JSON of type `unknown`.

```ts
import { uploadResponseSchema } from "#/domains/wizard/wizard-contracts.mod.server";

export const validateUploadResponse = (decoded: unknown) =>
  uploadResponseSchema.parse(decoded);
```

Reject unknown fields when the contract is strict. `z.object` strips them by default; stripping is not strict rejection. Normalize only as the contract permits. Keep file names unchanged when the contract requires their exact bytes. Map transport, decoding, and validation errors at the service boundary under its error-handling rules.

Keep storage credentials and private connectors on the server. The canonical source `etag` is public contract data. The browser uses it to bind scrub and download requests to the reviewed source.

## Don'ts
### Do not replace validation with a cast or proxy file bytes through an unnecessary hop

This cast accepts any decoded value without checking the upload response contract.

```ts
import type { CreateUploadResponse } from "#/domains/wizard/wizard-contracts.mod.server";

export const trustUploadResponse = (decoded: unknown) =>
  decoded as CreateUploadResponse;
```

The browser sends file bytes directly to private storage with the backend-issued upload grant. Frontend routes and tRPC carry workflow data, not file bytes. Do not replace that flow with a frontend or backend byte proxy.
