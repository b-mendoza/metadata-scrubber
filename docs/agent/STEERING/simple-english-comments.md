# Comment the reason, not the code

Scope: every service and language.

Why: code shows what it does. Use comments for constraints, trade-offs, or non-obvious invariants that the code cannot express.

## Do's
### Write the reason, constraint, or trade-off

```go
// Keep the caller's bytes unchanged for retries.
workingCopy := bytes.Clone(input)
```

## Don'ts
### Do not narrate behavior or record change history

```go
// Clone the input bytes.
workingCopy := bytes.Clone(input)

// Now uses bytes.Clone instead of a manual copy.
```
The change note belongs in the commit message.
