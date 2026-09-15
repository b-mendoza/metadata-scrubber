# Delegate bounded, reviewable units of work

Scope: large tasks and work that can run in subagents.

Why: bounded units keep intermediate file dumps out of the main thread. The main thread keeps the conclusions and checks the results.

## Do's
### Define the objective, inputs, scope, definition of done, and result format

Delegate when the task or a skill requires it. Use subagents for broad searches, audits across many files, self-contained investigations, and independent parallel work. Ask before dispatch if the delegation choice is unclear.

Split large tasks into units that can each be merged, tested, and reviewed without another unit. Avoid dependencies that block a unit. Give each agent explicit scope constraints and a required result format.

```text
Hypothetical review unit
Objective: check whether upload admission rejects oversized input before decoding.
Input: the upload contract and the current admission code.
Scope: read only the admission code and its tests. Do not edit files.
Done when: each admission branch has test evidence or an identified gap.
Result: findings with file locations, evidence, and gaps. Do not return file dumps.
```

## Don'ts
### Do not combine unrelated outcomes or assign a unit that cannot stand alone

```text
Fix uploads, rename the storage layer, and update deployment settings.
Wait for the other agent's unfinished rewrite before deciding how to test your changes.
```
