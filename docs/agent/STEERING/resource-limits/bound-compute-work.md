# Bound every expensive boundary

Scope: every request path that reads input, holds memory, or calls a shared or expensive resource.

Why: unbounded work can exhaust a process. Set limits before the expensive step starts.

## Do's
### Bound work, bytes, expansion, and duration, and reject overload

```text
Budget design:
- Limit active work and waiting requests before source reads or processing.
- Enforce input and output byte ceilings. A browser size check is not a server limit.
- Check decoded bytes and image pixels before expansion. Stop at the ceiling.
- Bound admission waits and I/O duration. Define and enforce a processing budget.
- Reject overload before buffering or fan-out. Release capacity on every exit.
```

Propagate deadlines to operations that support cancellation. Check cancellation between processing stages. A timeout signal does not preempt CPU work that cannot respond to cancellation. Keep active-work, input, and expansion limits in force until that work exits. A hard runtime limit requires an enforceable termination boundary; returning a timeout response alone is not that boundary.

The backend shares two processing permits per process. Admission waits at most two seconds, or less if the request is canceled. An admission timeout returns an overload response. The permit covers source download and PDF processing. The scrub stage releases it before uploading sanitized bytes. A sanitized cache hit skips processing admission.

## Don'ts
### Do not treat a permit count as the whole resource budget

```text
Incorrect budget claim:
Two permits and a two-second wait bound all request memory and fleet cost.
Therefore, waiting requests, decoded buffers, uploads, and instance count need no limits.
```

The gate does not cap waiter count or memory. Buffers can remain live during uploads after release. A per-process gate is not a fleet-wide budget. Bound each expensive boundary separately.
