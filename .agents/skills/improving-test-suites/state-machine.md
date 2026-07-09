# State Machine — improving-test-suites

Finite-state execution model for this skill. Mermaid SoT:
[`flow-diagram.md`](./flow-diagram.md). This table is the authoritative list of
states, transitions, guards, and terminals. Subagent status detail:
[`references/orchestration-protocol.md`](./references/orchestration-protocol.md).

## States

| State | Kind | Role |
| ----- | ---- | ---- |
| `Intake` | active | Normalize inputs; choose resume vs fresh |
| `Resume` | active | Restore packet; jump to named next step |
| `ResolveTargets` | active | Expand `TARGET_TEST_FILES` to existing files |
| `AskTarget` | active | Ask for targets |
| `ValueReview` | active | Dispatch `test-value-reviewer` |
| `AskValue` | active | Ask value blocker/clarification |
| `ApiRoute` | active | Decide API/security dispatch |
| `ApiReview` | active | Dispatch `api-security-reviewer` |
| `ApiSufficiency` | active | Optional-review checklist for API |
| `AskApi` | active | Ask API/security question |
| `OptionalRisk` | active | Record API remaining risk |
| `MaintRoute` | active | Decide maintainability dispatch |
| `MaintReview` | active | Dispatch `test-maintainability-reviewer` |
| `MaintSufficiency` | active | Optional-review checklist for maintainability |
| `AskMaint` | active | Ask maintainability question |
| `OptionalRiskMaint` | active | Record maintainability remaining risk |
| `Synthesis` | active | Build `MINIMAL_HARNESS_DECISION` |
| `DualAuthority` | active | Production / non-additive shared-helper approval |
| `WorkspaceRisk` | active | Dirty-target / no-VCS gates before plan |
| `AskDirty` | active | Ask dirty-workspace approval |
| `AskNoVcs` | active | Ask no-VCS acknowledgment |
| `PlanApproval` | active | Plan gate or recorded `AUTO_APPROVE` |
| `AskPlan` | active | Ask itemized plan approval |
| `Refactor` | active | Dispatch `test-refactorer` |
| `AskRefactor` | active | Ask refactor scope question |
| `Conformance` | active | Map decisions ↔ actions ↔ surviving tests |
| `AskConform` | active | Ask conformance user decision |
| `Validate` | active | Dispatch `test-validator` |
| `AskValidate` | active | Ask validation command/permission |
| `Repair` | active | Cause-first repair; increment `REPAIR_TOTAL` |
| `TerminalChanged` | terminal | `CHANGED_PASS` |
| `TerminalNoChange` | terminal | `COMPLETE_NO_SAFE_CHANGE` |
| `TerminalBug` | terminal | `COMPLETE_PRODUCTION_BUG_EXPOSED` |
| `TerminalFailed` | terminal | `VALIDATION_FAILED_AFTER_REPAIR` |
| `TerminalError` | terminal | `COMPLETE_ERROR` |
| `TerminalBlocked` | terminal | `COMPLETE_BLOCKED` (+ resume packet) |

## Transitions

| From | To | Guard / event |
| ---- | -- | ------------- |
| `[*]` | `Intake` | run start |
| `Intake` | `Resume` | `RESUME_PACKET` present |
| `Intake` | `ResolveTargets` | fresh run |
| `Resume` | named active state | `next step` in packet |
| `ResolveTargets` | `ValueReview` | ≥1 existing test file |
| `ResolveTargets` | `AskTarget` | zero files |
| `AskTarget` | `ResolveTargets` | answered |
| `AskTarget` | `TerminalBlocked` | no answer |
| `ValueReview` | `ApiRoute` | `VALUE_STATUS=PASS` |
| `ValueReview` | `AskValue` | `BLOCKED` or `NEEDS_CLARIFICATION` |
| `ValueReview` | `TerminalError` | `ERROR` |
| `AskValue` | `ValueReview` | answered |
| `AskValue` | `TerminalBlocked` | no answer |
| `ApiRoute` | `ApiReview` | route `required` or `optional` |
| `ApiRoute` | `MaintRoute` | route `not needed` |
| `ApiReview` | `MaintRoute` | `PASS` or `NOT_APPLICABLE` |
| `ApiReview` | `ApiSufficiency` | `BLOCKED` / `NEEDS_CLARIFICATION` / `ERROR` |
| `ApiSufficiency` | `AskApi` | required, or optional checklist fails |
| `ApiSufficiency` | `OptionalRisk` | optional and checklist passes |
| `AskApi` | `ApiReview` | answered |
| `AskApi` | `TerminalBlocked` | no answer |
| `AskApi` | `TerminalError` | unrecoverable `ERROR` |
| `OptionalRisk` | `MaintRoute` | remaining risk recorded |
| `MaintRoute` | `MaintReview` | route `required` or `optional` |
| `MaintRoute` | `Synthesis` | route `not needed` |
| `MaintReview` | `Synthesis` | `PASS` |
| `MaintReview` | `MaintSufficiency` | non-pass |
| `MaintSufficiency` | `AskMaint` | required, or optional checklist fails |
| `MaintSufficiency` | `OptionalRiskMaint` | optional and checklist passes |
| `AskMaint` | `MaintReview` | answered |
| `AskMaint` | `TerminalBlocked` | no answer |
| `AskMaint` | `TerminalError` | unrecoverable `ERROR` |
| `OptionalRiskMaint` | `Synthesis` | remaining risk recorded |
| `Synthesis` | `Validate` | **no safe edit justified** (zero eligible harness actions) |
| `Synthesis` | `DualAuthority` | safe edit + production/non-additive shared helper |
| `Synthesis` | `WorkspaceRisk` | safe edit + test-tree only |
| `DualAuthority` | `WorkspaceRisk` | approved and `SCOPE_LIMITS` permits |
| `DualAuthority` | `TerminalBug` | declined bug driver |
| `DualAuthority` | `Synthesis` | declined otherwise (replan) |
| `DualAuthority` | `TerminalBlocked` | no answer |
| `WorkspaceRisk` | `PlanApproval` | clean VCS, or dirty approved, or no-VCS acknowledged |
| `WorkspaceRisk` | `AskDirty` | dirty targets without approval |
| `WorkspaceRisk` | `AskNoVcs` | no VCS without acknowledgment |
| `AskDirty` | `WorkspaceRisk` | approved |
| `AskDirty` | `TerminalBlocked` | declined or no answer |
| `AskNoVcs` | `WorkspaceRisk` | acknowledged |
| `AskNoVcs` | `TerminalBlocked` | declined or no answer |
| `PlanApproval` | `Refactor` | `AUTO_APPROVE=true` recorded, or plan already approved/amended |
| `PlanApproval` | `AskPlan` | `AUTO_APPROVE=false` |
| `AskPlan` | `Refactor` | approved or amended |
| `AskPlan` | `TerminalNoChange` | declined |
| `AskPlan` | `TerminalBlocked` | no answer |
| `Refactor` | `Conformance` | `PASS` |
| `Refactor` | `AskRefactor` | `BLOCKED` or `NEEDS_CLARIFICATION` |
| `Refactor` | `TerminalBug` | `FAIL` production bug outside scope |
| `Refactor` | `TerminalBlocked` | `FAIL` otherwise |
| `Refactor` | `Repair` | `ERROR` and active repair and budget left |
| `Refactor` | `TerminalError` | `ERROR` otherwise |
| `AskRefactor` | `Refactor` | answered |
| `AskRefactor` | `TerminalBlocked` | no answer |
| `Conformance` | `Validate` | conformance passes |
| `Conformance` | `Repair` | repairable mismatch and budget left |
| `Conformance` | `AskConform` | needs user decision |
| `AskConform` | `Synthesis` | answered |
| `AskConform` | `TerminalBlocked` | no answer |
| `Validate` | `TerminalChanged` | `PASS` with changed files |
| `Validate` | `TerminalNoChange` | `PASS` with no changes |
| `Validate` | `AskValidate` | `BLOCKED` |
| `Validate` | `TerminalError` | `ERROR` |
| `Validate` | `TerminalBug` | `FAIL` no changes + production bug |
| `Validate` | `TerminalNoChange` | `FAIL` no changes otherwise |
| `Validate` | `Repair` | `FAIL` with changed files |
| `AskValidate` | `Validate` | answered |
| `AskValidate` | `TerminalBlocked` | no answer |
| `Repair` | `Refactor` | test-edit repair; `REPAIR_TOTAL < 3` |
| `Repair` | `Validate` | validation retry; `REPAIR_TOTAL < 3` |
| `Repair` | `DualAuthority` | production fix in scope |
| `Repair` | `TerminalFailed` | budget exhausted / pre-existing / unknown no retry |
| `Repair` | `TerminalBug` | production bug declined or out of scope |
| each `Terminal*` | `[*]` | handoff emitted |

## Guards (load-bearing)

| Guard | Definition |
| ----- | ---------- |
| Safe edit justified | `MINIMAL_HARNESS_DECISION` contains ≥1 keep/rewrite/delete/consolidate/add item eligible for file mutation |
| Dirty targets | Version control reports uncommitted changes in files the run may edit |
| No VCS | No version-control metadata for the workspace |
| Optional sufficiency | (1) `VALUE_STATUS=PASS`; (2) every high-value behavior has a coverage rating; (3) value routing reason does not mention the blocked surface |
| `AUTO_APPROVE` bypass | Input `true` recorded in handoff; bypasses **plan gate only** |

## Terminals

| State | Handoff status |
| ----- | -------------- |
| `TerminalChanged` | `CHANGED_PASS` |
| `TerminalNoChange` | `COMPLETE_NO_SAFE_CHANGE` |
| `TerminalBug` | `COMPLETE_PRODUCTION_BUG_EXPOSED` |
| `TerminalFailed` | `VALIDATION_FAILED_AFTER_REPAIR` |
| `TerminalError` | `COMPLETE_ERROR` |
| `TerminalBlocked` | `COMPLETE_BLOCKED` |
