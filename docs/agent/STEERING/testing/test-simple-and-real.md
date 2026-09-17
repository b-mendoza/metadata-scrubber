# Keep test data simple

Scope: every test.

Why: inline values keep simple cases visible. Shared setup earns its place when several tests need the same non-trivial work.

## Do's
### Use inline literals and share non-trivial setup when several tests need it

```text
Simple case:
Put fileName "report.pdf" and fileSizeBytes 1 in the typed request at the call site.

Repeated non-trivial setup:
Reuse setup for the handler, request bindings, and a storage fake across tests.
Keep each test's payload, action, and expected behavior visible.
```

Shared fake setup is valid. Use a real boundary when the behavior under test depends on that boundary. A real container is not a requirement for every shared fixture. Build typed request and response payloads at the call site and serialize them there.

## Don'ts
### Do not hide simple values or duplicate the implementation in a helper

```text
Unnecessary indirection:
Build a factory used by one test to return the literal name "report.pdf".
Use a helper that repeats the production transformation to compute its expected result.
Require every unit test to start a real storage container just to share setup.
```

A builder or factory belongs where several tests share non-trivial setup, not wherever two literals repeat.
