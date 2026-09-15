# Prove the regression test needs the fix

Scope: every bug fix.

Why: a test that passes with and without the change does not prove the bug or its fix.

## Do's
### Confirm failure without the fix and success with it

Verification scenario, not a record of completed checks:

```text
Bug scenario: a canceled request can start source work while waiting for capacity.
Exercise that cancellation with a regression test.
Without the fix: require the test to fail on the unwanted source work.
With the fix: require the same test to pass and leave no permit held.
Keep the test as the regression guard.
```

If the test already exists or the fix is already written, still prove the test fails without the fix. Preserve unrelated work during verification. The requirement is evidence, not a mandatory order for authoring the test and code.

## Don'ts
### Do not treat a green run as proof of the regression

```text
Insufficient evidence:
Run the new test only with the fix present and call the bug proven.
Run it without the fix, see it pass, and keep it as the claimed regression test.
```

A failure caused only by broken setup, compilation, or a missing dependency does not prove the behavioral defect.
