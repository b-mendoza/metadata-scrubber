# State Machine — committing-scoped-changes

Finite-state execution model for this skill. Mermaid rendering lives in
[`flow-diagram.md`](./flow-diagram.md). `SKILL.md` remains normative for
gates, status strings, and specialist contracts; this table is the canonical
transition set (gap-002).

## Run-scoped variables

| Variable | Initial | Rules |
| -------- | ------- | ----- |
| `replan_count` | 0 | Increment on each full replan (declined gates or post-commit divergence). Cap 3; breach → `Blocked`. |
| `clarify_count` | 0 | Increment on each planner `NEEDS_DECISION` round-trip. Cap 2; breach → `Blocked`. |
| `verify_attempts` | 0 per group | Increment on `same-scope-same-group-retry`. Cap 3 total attempts per group. |
| `commits_created` | 0 | Increment on each `COMMIT_EXECUTE: PASS`. Used to distinguish `Success` vs `NoScopedChanges` after empty refresh (gap-001). |
| `APPROVED_COMMIT_SCOPE` | `CHANGE_PATHS` | Grows only via exact paths approved at `WaitScopeExpansion`. |
| `group_queue` | from plan | Remaining approved groups; empty after last successful execute+refresh path → `Success` when `commits_created` ≥ 1 (gap-004). |

## States

| State | Kind | Actor |
| ----- | ---- | ----- |
| `Intake` | active | Orchestrator |
| `ResumeValidate` | active | Orchestrator |
| `CaptureAuthority` | active | Orchestrator |
| `ValidatePaths` | active | Orchestrator |
| `WaitPaths` | wait | Orchestrator → user |
| `InspectState` | active | `scoped-state-summarizer` |
| `WaitDetachedHead` | wait | Orchestrator → user (`G_DETACHED_HEAD`) |
| `PlanBoundaries` | active | `commit-boundary-planner` |
| `WaitPlanDecision` | wait | Orchestrator → user |
| `ApplyHumanGates` | active | Orchestrator |
| `WaitScopeExpansion` | wait | Orchestrator → user (`G_SCOPE_EXPANSION`) |
| `WaitOmission` | wait | Orchestrator → user (`G_IN_SCOPE_OMISSION`) |
| `WaitUnverified` | wait | Orchestrator → user (`G_UNVERIFIED_COMMIT`) |
| `ExecuteGroup` | active | `scoped-commit-executor` |
| `WaitVerifyDecision` | wait | Orchestrator → user |
| `RefreshState` | active | `scoped-state-summarizer` (`post-commit`) |
| `Success` | terminal | — |
| `NoScopedChanges` | terminal | — |
| `Blocked` | terminal | — |
| `VerifyFailed` | terminal | — |
| `CommitError` | terminal | — |
| `Error` | terminal | — |

Wait states emit `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` with a `Resume state`
block naming this state as the flow node, then end the turn. Resume re-enters
at `ResumeValidate` → named node when valid.

## Transitions

| From | To | Guard / event |
| ---- | -- | ------------- |
| `[*]` | `Intake` | Skill invoked |
| `Intake` | `ResumeValidate` | `RESUME_STATE` supplied |
| `Intake` | `CaptureAuthority` | No resume block |
| `ResumeValidate` | *(named node)* | Resume valid against repo |
| `ResumeValidate` | `CaptureAuthority` | Resume invalid → restart intake |
| `CaptureAuthority` | `Blocked` | No verbatim commit request |
| `CaptureAuthority` | `ValidatePaths` | `COMMIT_REQUEST_QUOTE` present |
| `ValidatePaths` | `WaitPaths` | Paths missing or ambiguous |
| `ValidatePaths` | `InspectState` | Literal paths valid; scope set |
| `WaitPaths` | `ValidatePaths` | User answered |
| `WaitPaths` | `Blocked` | Declined / silent after policy |
| `InspectState` | `Blocked` | In-progress git operation; or `SCOPED_STATE: BLOCKED` |
| `InspectState` | `WaitDetachedHead` | Detached HEAD |
| `InspectState` | `NoScopedChanges` | `SCOPED_STATE: NO_SCOPED_CHANGES` |
| `InspectState` | `WaitPaths` | `SCOPED_STATE: NEEDS_CONTEXT` (path/intent) |
| `InspectState` | `Error` | `SCOPED_STATE: ERROR` |
| `InspectState` | `PlanBoundaries` | `SCOPED_STATE: PASS` and HEAD attached (or detached already approved) |
| `WaitDetachedHead` | `PlanBoundaries` | User approved continue |
| `WaitDetachedHead` | `Blocked` | User declined |
| `PlanBoundaries` | `NoScopedChanges` | `COMMIT_PLAN: NO_COMMIT_WORTHY_CHANGES` |
| `PlanBoundaries` | `WaitPlanDecision` | `COMMIT_PLAN: NEEDS_DECISION` ∧ `clarify_count` < 2 |
| `PlanBoundaries` | `Blocked` | `NEEDS_DECISION` ∧ `clarify_count` ≥ 2; or `COMMIT_PLAN: BLOCKED` |
| `PlanBoundaries` | `Error` | `COMMIT_PLAN: ERROR` |
| `PlanBoundaries` | `ApplyHumanGates` | `COMMIT_PLAN: PASS` |
| `WaitPlanDecision` | `PlanBoundaries` | User answered; increment `clarify_count` |
| `WaitPlanDecision` | `Blocked` | Declined / silent |
| `ApplyHumanGates` | `WaitScopeExpansion` | Group path outside `APPROVED_COMMIT_SCOPE` |
| `ApplyHumanGates` | `WaitOmission` | Omissions non-empty (after expansion resolved) |
| `ApplyHumanGates` | `WaitUnverified` | Next group `Verification: not-run` (after omission resolved) |
| `ApplyHumanGates` | `ExecuteGroup` | All gates clear for next group |
| `WaitScopeExpansion` | `ApplyHumanGates` | Approved → add exact paths; or declined → record `USER_DECISIONS`, `replan_count` < 3 → `PlanBoundaries` |
| `WaitScopeExpansion` | `PlanBoundaries` | Declined ∧ `replan_count` < 3 (increment) |
| `WaitScopeExpansion` | `Blocked` | Declined ∧ `replan_count` ≥ 3 |
| `WaitOmission` | `ApplyHumanGates` | Approved continue |
| `WaitOmission` | `PlanBoundaries` | Declined ∧ `replan_count` < 3 |
| `WaitOmission` | `Blocked` | Declined ∧ `replan_count` ≥ 3 |
| `WaitUnverified` | `ExecuteGroup` | Approved for this group |
| `WaitUnverified` | `PlanBoundaries` | Declined replan ∧ `replan_count` < 3 |
| `WaitUnverified` | `WaitVerifyDecision` | Declined pending user-supplied check |
| `WaitUnverified` | `Blocked` | Declined ∧ `replan_count` ≥ 3 |
| `ExecuteGroup` | `RefreshState` | `COMMIT_EXECUTE: PASS` (increment `commits_created`) |
| `ExecuteGroup` | `ExecuteGroup` | `VERIFY_FAILED` ∧ recovery `same-scope-same-group-retry` ∧ `verify_attempts` < 3 |
| `ExecuteGroup` | `WaitVerifyDecision` | `VERIFY_FAILED` ∧ `needs-user-decision` |
| `ExecuteGroup` | `VerifyFailed` | `VERIFY_FAILED` ∧ (`terminal` ∨ attempts exhausted) |
| `ExecuteGroup` | `Blocked` | `COMMIT_EXECUTE: BLOCKED` |
| `ExecuteGroup` | `CommitError` | `COMMIT_EXECUTE: COMMIT_ERROR` |
| `ExecuteGroup` | `Error` | `COMMIT_EXECUTE: ERROR` |
| `WaitVerifyDecision` | `ExecuteGroup` | User answered with retry delta |
| `WaitVerifyDecision` | `VerifyFailed` | Declined / exhausted |
| `RefreshState` | `Success` | `SCOPED_STATE: NO_SCOPED_CHANGES` ∧ `commits_created` ≥ 1 (gap-001) |
| `RefreshState` | `NoScopedChanges` | `SCOPED_STATE: NO_SCOPED_CHANGES` ∧ `commits_created` = 0 |
| `RefreshState` | `WaitPaths` | `SCOPED_STATE: NEEDS_CONTEXT` |
| `RefreshState` | `Blocked` | `SCOPED_STATE: BLOCKED` |
| `RefreshState` | `Error` | `SCOPED_STATE: ERROR` |
| `RefreshState` | `PlanBoundaries` | `PASS` ∧ remaining scoped changes diverge from plan ∧ `replan_count` < 3 |
| `RefreshState` | `Blocked` | Divergence ∧ `replan_count` ≥ 3 |
| `RefreshState` | `ExecuteGroup` | `PASS` ∧ `group_queue` non-empty ∧ no divergence |
| `RefreshState` | `Success` | `PASS` ∧ `group_queue` empty ∧ `commits_created` ≥ 1 (gap-004) |
| `Success` | `[*]` | Final `COMMIT_SCOPED_CHANGES: SUCCESS` |
| `NoScopedChanges` | `[*]` | Final `COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES` |
| `Blocked` | `[*]` | Final `COMMIT_SCOPED_CHANGES: BLOCKED` |
| `VerifyFailed` | `[*]` | Final `COMMIT_SCOPED_CHANGES: VERIFY_FAILED` |
| `CommitError` | `[*]` | Final `COMMIT_SCOPED_CHANGES: COMMIT_ERROR` |
| `Error` | `[*]` | Final `COMMIT_SCOPED_CHANGES: ERROR` |

## Reachability

Every listed state is reachable from `Intake` via documented guards. All six
terminals exit to `[*]`. Wait states resume to an active state or escalate to
`Blocked` / `VerifyFailed`. `ApplyHumanGates` always progresses to a wait,
`ExecuteGroup`, or replan. No dead states.

## Terminal naming (gap-001 / gap-003 / gap-004)

| Condition | Final status |
| --------- | ------------ |
| Commit loop finished with ≥1 commit and evidence; or refresh empty after commits; or queue empty after refresh with ≥1 commit | `COMMIT_SCOPED_CHANGES: SUCCESS` |
| Initial/plan/refresh empty scope with `commits_created` = 0; or planner `NO_COMMIT_WORTHY_CHANGES` | `COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES` |
| Missing authority, in-progress op, declined detached HEAD, impossible plan, loop guard | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| Executor terminal verify failure or retry cap | `COMMIT_SCOPED_CHANGES: VERIFY_FAILED` |
| Executor commit creation failure | `COMMIT_SCOPED_CHANGES: COMMIT_ERROR` |
| Unexpected specialist error | `COMMIT_SCOPED_CHANGES: ERROR` |
| Any wait state ending the turn | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` + Resume state |
