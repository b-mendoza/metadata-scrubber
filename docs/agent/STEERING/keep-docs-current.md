# Verify references and update them with the change

Scope: every referenced file, path, or symbol and every change to architecture, conventions, or commands.

Why: a stale or invented reference sends the reader to the wrong place.

## Do's
### Verify each target on disk and update the matching reference in the same change

Confirm that each file, path, and symbol exists before referencing it in code or documentation. Resolve links from the document's directory. Update the matching reference when architecture, file conventions, or commands change. Include that update with the change, not in a later cleanup.

Update a reference doc that already exists. This rule does not require a new reference file.

```text
Verified repository-relative source path: backend/internal/handler/workflow_support.go
If that file moves, update its reference in the same change.

Reference file that a change makes stale: update it with that change.
```

## Don'ts
### Do not invent a reference or leave a known stale target

```text
I did not check whether the referenced file exists.
The command changed, but I will update its reference in a later cleanup.
Create a reference file only to satisfy the layout.
```
