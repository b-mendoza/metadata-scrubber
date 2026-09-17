# Preserve the workflow wire contracts

Scope: frontend generic type design and the browser-to-tRPC and frontend-to-backend workflow contracts.

Why: meaningful constraints restrict generic code to supported inputs; explicit small-JSON contracts keep file bytes out of the frontend server.

## Do's

### Reuse the real procedure schemas and exact field names

Use exports from `wizard-contracts.mod.server.ts`; do not rebuild weaker schemas. `getWorkflowConfig` has no input. Input schemas do not all share their procedure's name.

| Procedure | Input schema | Fields |
| --- | --- | --- |
| `getWorkflowConfig` | None | None |
| `createUpload` | `uploadInputSchema` | `fileName`, `fileSizeBytes` |
| `dryRun` | `dryRunInputSchema` | `storageKey` |
| `scrubFile` | `scrubFileInputSchema` | `etag`, `storageKey` |
| `refreshDownloadGrant` | `refreshDownloadGrantInputSchema` | `etag`, `storageKey` |
| `confirmDelete` | `confirmDeleteInputSchema` | `storageKey` |

`scrubFileInputSchema` contains only `etag: canonicalETagSchema` and `storageKey: storageKeySchema`. The ETag is exactly 32 lowercase hexadecimal characters, with no quotes or whitespace. The private `storageKeySchema` checks the backend's `uploads/` plus lowercase UUIDv4 wire grammar; reuse the exported whole schema instead of importing that private binding.

These are valid server-side contract examples:

```ts
import {
  scrubFileInputSchema,
  uploadInputSchema,
} from "#/domains/wizard/wizard-contracts.mod.server";

uploadInputSchema.parse({ fileName: "report.pdf", fileSizeBytes: 4096 });
scrubFileInputSchema.parse({
  etag: "0123456789abcdef0123456789abcdef",
  storageKey: "uploads/123e4567-e89b-42d3-a456-426614174000",
});
```

`fileSizeBytes` must be a positive integer. `fileNameSchema` rejects blank or padded names, names over 255 UTF-8 bytes, control characters, slashes, backslashes, and the replacement character. It does not trim names into validity. Download-grant expiry uses RFC 3339 whole-second timestamps.

The backend owns the size ceiling. Read the positive runtime `maxFileSizeBytes` through `getWorkflowConfig`; do not copy a cap into the frontend. See [direct uploads](../file-transfer-workflow/direct-storage-uploads.md).

### Give every generic an explicit, meaningful constraint

The constraint must name the accepted types or the operations that the generic code requires. This type-design illustration accepts only upload or scrub inputs; `WorkflowDraft` is not an existing application export or a proposed runtime abstraction:

```ts
import type {
  CreateUploadInput,
  ScrubFileInput,
} from "#/domains/wizard/wizard-contracts.mod.server";

export interface WorkflowDraft<
  TInput extends CreateUploadInput | ScrubFileInput,
> {
  input: TInput;
}
```

## Don'ts

### Do not leave generic parameters unconstrained

This version permits unrelated input types instead of naming the supported contracts:

```ts
export interface WorkflowDraft<TInput> {
  input: TInput;
}
```

### Do not invent field names or send file bytes

This is not a scrub input; `eTag`, `fileName`, `fileSize`, and `fileBytes` are not its fields:

```json
{
  "eTag": "0123456789abcdef0123456789abcdef",
  "fileName": "report.pdf",
  "fileSize": 4096,
  "storageKey": "uploads/123e4567-e89b-42d3-a456-426614174000",
  "fileBytes": [37, 80, 68, 70]
}
```
