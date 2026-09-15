# Test application decisions

Scope: every service and language.

Why: application branches carry behavior risk. Repeating dependency guarantees does not check those decisions.

## Do's
### Cover current branches, routing, wiring, and code-owned transformations

Test-design example for the existing upload workflow:

```text
Given a fileSizeBytes value above storage.MaxSourceObjectBytes:
- Call the upload handler with a typed request.
- Require HTTP 413 and no storage calls.

Given a valid name and size:
- Require an upload grant with the application-owned storageKey shape.
- Check the storage operation and arguments selected by the handler.
```

Match depth to risk. Give core logic thorough coverage. Give pass-throughs, getters, and type-system guarantees little or no coverage. Test current behavior, not possible future logic. Add a transformation test when application code adds the transformation.

## Don'ts
### Do not test dependency internals, direct returns, or copies of tool configuration

```text
Low-value test designs:
- Check that ky rejects a 500 without testing any application policy.
- Make a mock return a value, then assert only that a pass-through returns it.
- Copy a library's internal structure into test setup.
- Copy an external tool's configuration into expected test data.
```

Use the external tool's own validator, lint, check, or dry-run command to validate its configuration. Test the behavior the configuration produces when that behavior belongs to the application.
