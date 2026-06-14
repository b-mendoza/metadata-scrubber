# Workflow Examples

Load this file only when the orchestrator or user needs concrete examples of
dispatch, approval, warning handoffs, or failure cleanup.

## Plan Approval Card

```text
Plan approval required before mutation.

Diagnosis:
- D1: calculateInvoice mixes discount rules with formatting orchestration.

Ordered steps:
- S1: Extract private discount calculation helper from calculateInvoice; traces to D1.
- S2: Update private call sites in the same file; traces to D1.

Files to change or create:
- Change: src/invoice/calculate.ts
- Create: none

Size plan:
- src/invoice/calculate.ts: 214/250, within limit

Validation contract:
- npm test -- invoice
- Safety class: safe

Non-goals:
- Preserve all protected surfaces per `references/protected-surfaces.md`.

Decision: approve, adjust, or decline.
```

## Dispatch Round Trip

```text
1. Orchestrator dispatches behavior-mapper with TARGET_PATH, USER_GOAL,
   TEST_COMMAND, SCOPE_LIMITS, and MAX_LINES.
2. Mapper returns BEHAVIOR_MAP: PASS plus baseline, candidates, file sizes, and
   risks. Orchestrator keeps only the report fields.
3. Orchestrator resolves references and dispatches refactor-strategist with the
   behavior map and resolved reference paths.
4. Strategist returns STRATEGY: PASS. Orchestrator runs scope, size, validation,
   safety, and plan-approval gates.
5. Orchestrator dispatches refactor-implementer with the approved plan.
6. Implementer returns IMPLEMENTATION: PASS_WITH_WARNINGS because zero tests ran.
7. Reviewer verifies the warning and returns REFACTOR_REVIEW: PASS.
8. Orchestrator returns PASS_WITH_WARNINGS, not PASS.
```

## PASS_WITH_WARNINGS Handoff Skeleton

```text
Status: PASS_WITH_WARNINGS

Warning: validation command exited 0 but matched zero tests, so validation is
recorded as not run.

1. Current behavior summary: <summary>
2. Design diagnosis: <diagnosis>
3. Code changes made: <files and summaries>
4. Validation note: command, exit code, coverage evidence, tests not run, and
   pre-existing failures if any
5. Review outcome: REFACTOR_REVIEW: PASS; fix cycles used: 0 of 2; residual risks
6. File-size compliance: per-file lines, waivers, mechanical-edit exemptions
7. Brief improvement summary: <summary>
8. Worktree end-state: changed/created files left uncommitted; no commits made;
   suggested commit boundary versus pre-existing dirty files
9. Disclosures: dispatch method, AUTO_APPROVE if used, WEB_ACCESS mode, retries
```

## Failure Cleanup Block

```text
Worktree state after stop:
- src/invoice/calculate.ts: edited-from-clean. Refactor-only file; safe manual
  revert option: git checkout -- src/invoice/calculate.ts
- src/invoice/config.ts: edited-over-pre-existing. Manual review required before
  reverting because user changes existed at baseline.

The workflow never auto-reverts. It reports scoped guidance so the user can
choose the recovery action.
```

## No-Change Confirmation

```text
Mapper reports NO_CHANGE_CANDIDATE:
- Target has one responsibility and is under MAX_LINES.
- Existing tests cover the requested behavior.
- The requested simplification would introduce a new abstraction without current
  pressure.

Recommended stop: NO_CHANGE.
If the user wants to proceed anyway, record the explicit objective and continue
to strategy.
```
