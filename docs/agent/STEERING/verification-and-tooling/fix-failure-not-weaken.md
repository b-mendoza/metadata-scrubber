# Fix the cause of a failed check

Scope: every failing test, lint rule, or type check.

Why: weakening a check removes its signal while leaving the defect in place.

## Do's
### Fix code or synchronization, and explain wrong-test changes separately

```text
Wrong-test example:
The upload contract uses storageKey, but the fixture uses storage_key.
Confirm the concrete contract. Correct the fixture in a separate step.
Explain why the test was wrong and retain the exact storageKey assertion.

Synchronization example:
Wait for the observed operation or coordinate the test through a channel or event.
Keep the assertion that proves the intended order.
```

Do not change correct application behavior to satisfy a wrong test. Identify that test error before changing it. A separate step does not require a separate commit.

## Don'ts
### Do not skip, weaken, or delay the check to make it pass

```text
Incorrect fixes:
Skip the failing artifact test.
Replace an exact storageKey assertion with a presence check.
Add a longer sleep instead of waiting for the operation under test.
Suppress a lint error instead of fixing the structure that causes it.
```
