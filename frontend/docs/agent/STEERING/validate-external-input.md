# Validate external input at each boundary

Scope: all frontend validation logic, including browser code, server code, backend responses, and environment configuration.

Why: boundary validation prevents unchecked values and unknown workflow fields from reaching business logic.

## Do's

### Reuse Zod schemas and let input validation throw

Use Zod for all validation logic in every environment. Browser runtime code must use browser-safe schemas; do not import `.mod.server` schemas into browser runtime code.

Each tRPC procedure that accepts input declares its explicit Zod schema. `createUpload` uses `uploadInputSchema`; `getWorkflowConfig` takes no input. These server-side examples use the real exported upload validator:

```ts
import { uploadInputSchema } from "#/domains/wizard/wizard-contracts.mod.server";

uploadInputSchema.parse({ fileName: "report.pdf", fileSizeBytes: 4096 });
uploadInputSchema.parse({ fileName: " report.pdf", fileSizeBytes: 0 }); // throws
```

Validate backend success and error bodies too. Use `workflowConfigResponseSchema`, not a made-up config shape, and `backendErrorResponseSchema` for error bodies. All workflow input, success, error, and nested object schemas reject unknown properties. Keep environment parsing on `environmentSchema`; it selects supported variables from `process.env` rather than rejecting unrelated environment variables.

Input validators throw instead of returning error objects as successful values. Keep deliberate synchronous Zod throws; map dependency failures at the operation and throw the mapped error at the boundary as described in [server failure handling](server-neverthrow.md). Backend `413` maps to safe `PAYLOAD_TOO_LARGE`, not leaked backend text.

## Don'ts

### Do not replace the upload contract with permissive validation or return validation errors

This loses real name and size checks, accepts unknown input properties, and returns an error as a value:

```ts
import * as z from "zod";

const validateUploadInput = (input: unknown) => {
  const result = z.object({ fileName: z.string() }).safeParse(input);
  return result.success ? result.data : result.error;
};
```
