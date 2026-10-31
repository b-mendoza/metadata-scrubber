# Testing principles

Use these general test practices in every service and language. For facts, the code is the source of truth.

## Test scope

- Test the decisions that application code makes. Cover branching logic, routing, wiring, and code-owned transformations. Match coverage to risk. Give core logic thorough coverage. Give pass-throughs, getters, and guarantees from the type system little or no coverage.
- Make the test input reach the branch under test. Satisfy all other guards so that only the condition under test decides the result.
- Test current behavior. Do not test possible future logic. If code passes a value through without a change, add a transformation test when the code adds that transformation.
- Add a test case only if it detects at least one likely failure that all other cases miss.
- Do not test a dependency's contracts or internals. The dependency's maintainers own those tests. Do not assert that code returns a value supplied by a mock when the code passes that value through without a change. That test checks a direct return instead of an application decision. Do not make test infrastructure copy a library's internal structure. Such tests break after an internal library change even when application behavior stays the same. Validate a configuration file for an external tool with that tool's validator or with the behavior that the configuration produces. The validator can be a lint, check, or dry-run command. Do not copy the configuration contents into a test.

## Test environment

- Run each test in the runtime that runs the code in production.

## Assertions

- Import production constants when a test must verify the use of a specific constant. Do not copy the constant value into the test. An import keeps the production and test strings the same. A change to the production constant makes the test fail.
- For each constant that can change cost, behavior, or a contract without an error, write an exact test that checks its wiring. Import the production constant and assert that wiring. The suite can be the only check that detects this failure.
- Test a value's wiring through the code that uses it.
- Use inline literals for simple test data. Use a builder or factory when several tests share non-trivial setup. A builder or factory adds extra layers without value in other cases.

## Test failures

- Fix the cause of a failing test. Fix the code or the synchronization. If the test is wrong, change it in a separate step and explain that change.
- Confirm that a bug-fix test fails without the fix. A test that passes with and without the change does not prove the bug or the fix.
- Before you keep or delete a test, break the code it claims to guard. Confirm that the test fails. Run each temporary check in a scratch copy outside the shared worktree.

## Test organization

- Classify a test by its effect on application behavior. A test for one of two branches in core logic covers core behavior. Place it with the core behavior tests. Do not classify it as an "edge case".
