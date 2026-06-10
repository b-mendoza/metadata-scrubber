---
name: "refactoring-code"
description: "Coordinates behavior-preserving code refactors. Use when the user asks to simplify, clean up, remove over-engineering, split oversized files, clarify domain logic, or improve maintainability without adding features."
---

# Refactoring Code

You are a behavior-preserving refactoring orchestrator. Refactoring changes internal structure while preserving observable behavior. Your work is to think from concise handoffs, decide the next phase, preserve the approved boundary, and dispatch one focused subagent at a time.

Hold only the current phase, target path, decisions, statuses, and short reports. Code inspection, edits, validation, detailed review, examples, and conceptual guidance live in subagents, bundled references, or public web sources loaded just in time.

## Inputs

| Input | Required | Example |
| ----- | -------- | ------- |
| `TARGET_PATH` | Yes | `src/billing/apply-discount.ts` |
| `USER_GOAL` | No | `"simplify this without changing behavior"` |
| `TEST_COMMAND` | No | `npm test -- billing` |
| `SCOPE_LIMITS` | No | `"keep public API unchanged"` |
| `MAX_LINES` | No | `250` (default per-file ceiling for any file the refactor touches) |
| `REFERENCE_NEED` | No | `"wrong abstraction guidance"` |

If `TARGET_PATH` is missing, ask one focused question for the path before dispatching. Run one complete cycle per target unless the user asks for a broader pass.

## Output Contract

Start every final handoff with exactly one status line:
`Status: PASS | NO_CHANGE | NEEDS_CLARIFICATION | BLOCKED | ERROR`.
For `PASS`, continue in this order:

1. Current behavior summary
2. Design diagnosis focused on current problems only
3. Code changes made, including any file splits and where new files live
4. Validation note covering tests run, tests not run, pre-existing failures, and behavior preservation
5. Review outcome and remaining risks
6. File-size compliance summary: every changed or created file at or below `MAX_LINES`, or each overage with the waiver reason recorded in strategy
7. Brief improvement summary covering simplicity, readability, maintainability, domain clarity, and side-effect separation where applicable

Return only these user-facing statuses: `PASS`, `NO_CHANGE`, `NEEDS_CLARIFICATION`, `BLOCKED`, or `ERROR`. For `NO_CHANGE`, `NEEDS_CLARIFICATION`, `BLOCKED`, or `ERROR`, return the status line, smallest stopping reason, next decision needed, validation already completed, and remaining risks.

## Pipeline Overview

| Phase | Mode | Result |
| ----- | ---- | ------ |
| Behavior map | Dispatch `behavior-mapper` | `BEHAVIOR_MAP` facts, risks, file sizes, validation option |
| Reference decision | Inline gate | Reference status: `not needed`, `bundled-local-only`, `fetched`, `declined-but-safe`, or `unavailable-but-safe` |
| Strategy | Dispatch `refactor-strategist` | `STRATEGY` diagnosis, minimal plan, split decision, non-goals, reference status |
| Validation contract | Inline gate | Approved validation command or recorded warning before implementation |
| Implementation | Dispatch `refactor-implementer` | `IMPLEMENTATION` changes, new files, validation summary, deviations |
| Review | Dispatch `refactor-reviewer` | `REFACTOR_REVIEW` verdict including validation and size checks |
| Handoff | Inline | User-facing summary built from the four concise reports |

## Subagent Registry

| Subagent | Path | Purpose |
| -------- | ---- | ------- |
| `behavior-mapper` | `./subagents/behavior-mapper.md` | Maps observable behavior, tests, side effects, and file sizes before design |
| `refactor-strategist` | `./subagents/refactor-strategist.md` | Chooses the smallest useful refactor and any required split, fetching web references only for concrete decisions |
| `refactor-implementer` | `./subagents/refactor-implementer.md` | Applies approved behavior-preserving changes (including splits), runs the approved safe validation command when available, and reports warnings |
| `refactor-reviewer` | `./subagents/refactor-reviewer.md` | Reviews the resulting diff and `IMPLEMENTATION` report for behavior drift, scope drift, test-intent drift, validation quality, file-size compliance, and unnecessary abstraction |

Read a subagent file only when dispatching that subagent.

## Progressive Disclosure Map

| Need | Load Point | Location |
| ---- | ---------- | -------- |
| Core orchestration, contracts, file-size rule | When the skill triggers | This file |
| Subagent execution details | Immediately before dispatch | The selected registry path under `./subagents/` |
| Refactoring concepts and design trade-offs | Only when strategy or review needs external guidance for a concrete decision | `./references/refactoring-web-resources.md`, then the selected webpage when public web access is allowed |
| File-size rule details and split decision tree | Only when strategy or review must justify or enforce a split | `./references/file-size-policy.md`, then a selected webpage from `./references/refactoring-web-resources.md` if needed |
| Dispatch and output examples | Only when examples are needed | `./references/workflow-examples.md` |
| Workflow visualization and maintenance cross-check | Only when the user asks for a diagram, the workflow changes, or drift between routing and documentation is being checked | `./flow-diagram.md` |
| Raw code, test output, diffs, and file contents | Inside the responsible subagent | Summarized back as structured reports |

The skill is self-contained: every bundled path stays inside this skill directory and is relative to the file that contains it. External URLs are optional just-in-time fetch targets, never required bundled files; record the reference status either way.

## File Size Rule

Every touched, changed, or created file stays at or below `MAX_LINES` (default `250`) unless `STRATEGY` records a waiver. Load `./references/file-size-policy.md` only for counting rules, waiver categories, split decisions, or size-review failures. Load `./references/refactoring-web-resources.md` only when a split or design decision needs article-backed guidance.

## Test Change Boundary

Changes to test intent are outside this workflow: assertion changes, weakened expectations, fixture or snapshot updates, and new behavior coverage require a different user-approved task. Mechanical test import, path, or name updates required by an approved behavior-preserving refactor are allowed when reported by the implementer, counted against `MAX_LINES`, and reviewed for unchanged test intent.

## Execution Steps

| Step | Dispatch Or Gate | Continue When | Stop Or Branch When |
| ---- | ---------------- | ------------- | ------------------- |
| 1 | `behavior-mapper` with `TARGET_PATH`, `USER_GOAL`, `TEST_COMMAND`, `SCOPE_LIMITS`, `MAX_LINES` | `PASS` or `NO_CHANGE_CANDIDATE` | Ask the mapper's question on `NEEDS_CLARIFICATION`; stop on `ERROR` |
| 2 | Resolve `REFERENCE_NEED` from the behavior map and current decision | Reference status is `not needed`, `bundled-local-only`, `fetched`, `declined-but-safe`, or `unavailable-but-safe` | Ask before public web fetching when required; stop with `BLOCKED` only when a required source is declined or unavailable and local evidence is insufficient |
| 3 | `refactor-strategist` with the behavior map, scope, goal, `MAX_LINES`, `REFERENCE_NEED`, reference status, `REFERENCE_INDEX_PATH=./references/refactoring-web-resources.md`, and `FILE_SIZE_POLICY_PATH=./references/file-size-policy.md` | `PASS` | Stop without editing on `NO_CHANGE`; ask or report recovery on `NEEDS_CLARIFICATION` or `ERROR` |
| 4 | Scope, file-size, test-boundary, and validation gates | Plan remains behavior-preserving and validation is approved, safe, or recorded as a warning | Stop with `BLOCKED` if the plan requires behavior, public API, test-intent, scope, state, or unrelated worktree changes; ask before a file-size waiver or destructive/state-mutating validation command |
| 5 | `refactor-implementer` with the behavior map, strategy, validation contract, `MAX_LINES`, reference status, and `REFERENCE_INDEX_PATH=./references/refactoring-web-resources.md` | `PASS` or `PASS_WITH_WARNINGS` | Stop and report reason, files touched, and recovery on `BLOCKED` or `ERROR` |
| 6 | `refactor-reviewer` with the behavior map, strategy, implementation report, `MAX_LINES`, reference status, `REFERENCE_INDEX_PATH=./references/refactoring-web-resources.md`, and `FILE_SIZE_POLICY_PATH=./references/file-size-policy.md` | `PASS` | On `FAIL`, re-dispatch implementer with only behavior-preserving reviewer-required fixes; on `ERROR`, report recovery |

Use at most two targeted fix cycles after a review failure. Re-run only the implementer and reviewer for fixes that remain behavior-preserving and inside the approved strategy. Stop with `BLOCKED` if a required fix would change behavior, public API, test intent, scope, state, unrelated worktree state, or need an unapproved file-size waiver.

## Validation Loop

1. Map current behavior and file sizes before design or editing.
2. Choose the validation contract before implementation: the user's `TEST_COMMAND`, the mapper's suggested command, the smallest discoverable existing check, or an explicit validation warning.
3. Ask before running destructive or state-mutating validation commands.
4. Have the implementer run the approved safe validation command when available, or record the warning in `IMPLEMENTATION`.
5. Review the diff and `IMPLEMENTATION` report against the behavior map, strategy, validation contract, and `MAX_LINES`.
6. Fix only reviewer-identified issues that stay behavior-preserving and rerun the implementer/reviewer gate.

Passing tests are evidence, not complete proof. The review gate also checks scope control, public API stability, test intent, side effects, edge cases, abstraction discipline, and per-file size compliance.

## Example

For dispatch examples, output samples, and failure handoff patterns, load `./references/workflow-examples.md` only when needed.
