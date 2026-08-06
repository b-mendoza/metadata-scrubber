# Task-Execution Planning Artifact Templates

> Read this file only when assembling, repairing, or validating one planning artifact. Keep full artifact contents out of the coordinator summary.

`<KEY>` is the work-item identifier derived by the active playbook. The orchestrator passes its value under the shared alias `TICKET_KEY`.

Use these templates as the local artifact contract. External sources may inform wording or rationale, but they do not replace these headings.

## Execution Brief Template

```markdown
# Execution Brief - <KEY> Task <TASK_NUMBER>: <Title>

## Objective

<Concise task objective from the task plan.>

## Relevant Requirements and Context

<Only the requirements, decisions, and work-item context needed for this task.>

## Implementation Notes

<Known implementation guidance, constraints, and assumptions.>

## Definition of Done

<Task-specific completion criteria.>

## Likely Files / Artifacts Affected

<Likely files, modules, tests, docs, configs, or generated artifacts.>

## Resolved Questions and Decisions

<Resolved questions, waived questions, decisions-log entries, and re-plan decisions.>

## Constraints

<Scope boundaries for the eventual executor, including the one-task boundary.>
```

## Execution Plan Template

```markdown
# Execution Plan - <KEY> Task <TASK_NUMBER>: <Title>

## Codebase Summary

<Relevant files, local patterns, framework/tooling observations, and test conventions.>

## Recommended Skills

<Local skills that materially help implementation, or None.>

## Implementation Approach

<Ordered implementation sequence for the executor.>

## File-Level Strategy

<Per-file or per-module changes and why each belongs in scope.>

## Risks and Considerations

<Regression risks, migration risks, data concerns, operational concerns, and mitigations.>

## User Impact Assessment

<Concrete user-facing effect of each major implementation choice, or TBD.>

## Blockers / Ambiguities

<Only issues that must be resolved before reliable implementation.>
```

## Test Specification Template

```markdown
# Test Specification - <KEY> Task <TASK_NUMBER>: <Title>

## Test Framework and Conventions

<Framework, file placement, helper, fixture, assertion, and mocking conventions observed.>

## Test Groups

<Behavior-oriented test groups with priorities and edge cases.>

## Definition of Done Coverage

<Mapping from each definition-of-done item to a planned automated check or explicit blocker.>

## Notes for Task Executor

<Setup notes, data fixtures, mocks, commands, and sequencing hints.>

## Blockers / Ambiguities

<Untestable or unclear requirements that need resolution.>
```

## Refactoring Recommendation Template

```markdown
# Refactoring Recommendation - <KEY> Task <TASK_NUMBER>: <Title>

## Verdict

<Refactor before, Refactor during, or No refactoring needed.>

## Before Implementation

<Required cleanup before implementation starts, or None.>

## During Implementation

<Small cleanup safe to perform while implementing this task, or None.>

## Out of Scope

<Noted cleanup that should not be included in this task.>

## Impact on Existing Tests

<Expected test changes, unchanged tests, and regression checks.>

## Blockers / Ambiguities

<Ambiguity that prevents a trustworthy recommendation.>
```
