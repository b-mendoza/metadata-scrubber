# Flow Diagram

Canonical execution model: finite state machine. Guards, variables, and
terminals are tabulated in [`state-machine.md`](./state-machine.md).

```mermaid
stateDiagram-v2
  [*] --> Intake

  Intake --> ResumeValidate: RESUME_STATE supplied
  Intake --> CaptureAuthority: no resume

  ResumeValidate --> CaptureAuthority: invalid resume
  note right of ResumeValidate
    Valid resume jumps to named node
  end note

  CaptureAuthority --> Blocked: no commit quote
  CaptureAuthority --> ValidatePaths: quote present

  ValidatePaths --> WaitPaths: paths ambiguous
  ValidatePaths --> InspectState: paths valid
  WaitPaths --> ValidatePaths: user answered
  WaitPaths --> Blocked: declined or silent

  InspectState --> Blocked: in-progress op or BLOCKED
  InspectState --> WaitDetachedHead: detached HEAD
  InspectState --> NoScopedChanges: NO_SCOPED_CHANGES
  InspectState --> WaitPaths: NEEDS_CONTEXT
  InspectState --> Error: ERROR
  InspectState --> PlanBoundaries: PASS

  WaitDetachedHead --> PlanBoundaries: approved
  WaitDetachedHead --> Blocked: declined

  PlanBoundaries --> NoScopedChanges: NO_COMMIT_WORTHY_CHANGES
  PlanBoundaries --> WaitPlanDecision: NEEDS_DECISION and clarify under 2
  PlanBoundaries --> Blocked: clarify cap or BLOCKED
  PlanBoundaries --> Error: ERROR
  PlanBoundaries --> ApplyHumanGates: PASS

  WaitPlanDecision --> PlanBoundaries: user answered
  WaitPlanDecision --> Blocked: declined or silent

  ApplyHumanGates --> WaitScopeExpansion: expansion needed
  ApplyHumanGates --> WaitOmission: omissions non-empty
  ApplyHumanGates --> WaitUnverified: verification not-run
  ApplyHumanGates --> ExecuteGroup: gates clear

  WaitScopeExpansion --> ApplyHumanGates: approved
  WaitScopeExpansion --> PlanBoundaries: declined and replan under 3
  WaitScopeExpansion --> Blocked: replan cap

  WaitOmission --> ApplyHumanGates: approved
  WaitOmission --> PlanBoundaries: declined and replan under 3
  WaitOmission --> Blocked: replan cap

  WaitUnverified --> ExecuteGroup: approved
  WaitUnverified --> PlanBoundaries: declined replan under 3
  WaitUnverified --> WaitVerifyDecision: pending user check
  WaitUnverified --> Blocked: replan cap

  ExecuteGroup --> RefreshState: PASS
  ExecuteGroup --> ExecuteGroup: retry with delta under 3
  ExecuteGroup --> WaitVerifyDecision: needs-user-decision
  ExecuteGroup --> VerifyFailed: terminal or exhausted
  ExecuteGroup --> Blocked: BLOCKED
  ExecuteGroup --> CommitError: COMMIT_ERROR
  ExecuteGroup --> Error: ERROR

  WaitVerifyDecision --> ExecuteGroup: user retry
  WaitVerifyDecision --> VerifyFailed: declined or exhausted

  RefreshState --> Success: empty scope and commits_created ge 1
  RefreshState --> NoScopedChanges: empty scope and commits_created eq 0
  RefreshState --> WaitPaths: NEEDS_CONTEXT
  RefreshState --> Blocked: BLOCKED or replan cap
  RefreshState --> Error: ERROR
  RefreshState --> PlanBoundaries: divergence and replan under 3
  RefreshState --> ExecuteGroup: more groups
  RefreshState --> Success: queue empty and commits_created ge 1

  Success --> [*]
  NoScopedChanges --> [*]
  Blocked --> [*]
  VerifyFailed --> [*]
  CommitError --> [*]
  Error --> [*]
```

## Gate And Branch Summary

| Gate | Guard | Pass path | Stop / alternate |
| ---- | ----- | --------- | ---------------- |
| Authority | Verbatim commit quote | `ValidatePaths` | `Blocked` |
| Paths | Literal in-scope paths | `InspectState` | `WaitPaths` |
| Preflight | No in-progress git op | Continue | `Blocked` |
| `G_DETACHED_HEAD` | User approves detached HEAD | `PlanBoundaries` | `Blocked` |
| Planner clarify | `clarify_count` < 2 | Redispatch plan | `Blocked` at cap |
| `G_SCOPE_EXPANSION` | Exact paths approved | Grow scope | Replan or `Blocked` |
| `G_IN_SCOPE_OMISSION` | Omissions approved or replan | Continue / replan | `Blocked` at replan cap |
| `G_UNVERIFIED_COMMIT` | Group approved unverified | `ExecuteGroup` | Replan, wait, or `Blocked` |
| Verify retry | `same-scope-same-group-retry` ∧ attempts < 3 | `ExecuteGroup` | `WaitVerifyDecision` or `VerifyFailed` |
| Replan | `replan_count` < 3 | `PlanBoundaries` | `Blocked` |
| Empty refresh | `commits_created` ≥ 1 vs 0 | `Success` vs `NoScopedChanges` | — |

## Terminal States

- `Success` → `COMMIT_SCOPED_CHANGES: SUCCESS`
- `NoScopedChanges` → `COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES`
- `Blocked` → `COMMIT_SCOPED_CHANGES: BLOCKED`
- `VerifyFailed` → `COMMIT_SCOPED_CHANGES: VERIFY_FAILED`
- `CommitError` → `COMMIT_SCOPED_CHANGES: COMMIT_ERROR`
- `Error` → `COMMIT_SCOPED_CHANGES: ERROR`
- Wait states end the turn as `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` with Resume state
