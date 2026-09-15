# Colocate feature tests with their modules

Scope: test file placement in this service.

Why: a test belongs next to the code it covers.

## Do's

### Keep feature tests beside their subject and reuse shared setup

Use `.test.ts` and `.test.tsx` beside the module. Shared setup and helpers belong in `src/tests/`; render helpers live in `src/tests/utils/renderers/`.

```text
src/domains/wizard/wizard-router.mod.server.ts
src/domains/wizard/wizard-router.mod.server.test.ts
src/domains/wizard/components/file-uploader/file-uploader.mod.tsx
src/domains/wizard/components/file-uploader/file-uploader.mod.test.tsx
src/tests/setup-test-environment.ts
src/tests/utils/renderers/renderers.mod.tsx
```

## Don'ts

### Do not move feature test cases into the shared setup directory

```text
src/tests/wizard-router.mod.server.test.ts
src/tests/file-uploader.mod.test.tsx
```
