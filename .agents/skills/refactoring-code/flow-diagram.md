# Refactoring Code Flow

Finite-state control flow for the `refactoring-code` orchestrator
(`stateDiagram-v2`). Companion transition table:
[`state-machine.md`](./state-machine.md).

One FSM instance runs per approved target. Human gates: no-change confirmation,
web fetch, size waiver, validation safety, plan approval, and fix waiver.
Each dispatched subagent may be retried once for a plausibly transient `ERROR`.

```mermaid
stateDiagram-v2
  [*] --> Intake

  Intake --> TerminalNeedsClarification: TARGET_PATH missing or vague
  Intake --> MapBehavior: target specific

  MapBehavior --> TerminalNeedsClarification: BEHAVIOR_MAP NEEDS_CLARIFICATION
  MapBehavior --> MapBehavior: ERROR transient retry unused
  MapBehavior --> TerminalError: ERROR not retryable
  MapBehavior --> GateNoChange: NO_CHANGE_CANDIDATE
  MapBehavior --> ResolveReferences: PASS

  GateNoChange --> TerminalNoChange: user accepts stop
  GateNoChange --> ResolveReferences: user continues with objective

  ResolveReferences --> GateWebFetch: public source needed and WEB_ACCESS ask
  ResolveReferences --> DesignStrategy: local fetched deny-safe or pre-approved done
  ResolveReferences --> TerminalBlocked: required source unavailable and local insufficient

  GateWebFetch --> DesignStrategy: approved and fetch resolved or declined-safe
  GateWebFetch --> TerminalBlocked: declined or unavailable and local insufficient

  DesignStrategy --> TerminalNoChange: STRATEGY NO_CHANGE
  DesignStrategy --> TerminalNeedsClarification: STRATEGY NEEDS_CLARIFICATION
  DesignStrategy --> DesignStrategy: ERROR transient retry unused
  DesignStrategy --> TerminalError: ERROR not retryable
  DesignStrategy --> GateScope: PASS

  GateScope --> TerminalBlocked: checklist fail
  GateScope --> GateSizeWaiver: checklist pass

  GateSizeWaiver --> TerminalBlocked: waiver declined
  GateSizeWaiver --> SelectValidation: no waiver or waiver approved

  SelectValidation --> GateValidationSafety: command available
  SelectValidation --> GatePlanApproval: warning path recorded

  GateValidationSafety --> GatePlanApproval: safe or approved or warning path
  GateValidationSafety --> TerminalBlocked: unsafe declined without warning path

  GatePlanApproval --> Implement: AUTO_APPROVE or user approve
  GatePlanApproval --> TerminalNeedsClarification: decline or second adjust
  GatePlanApproval --> DesignStrategy: first adjust

  Implement --> TerminalBlocked: IMPLEMENTATION BLOCKED
  Implement --> Implement: ERROR transient retry unused
  Implement --> TerminalError: ERROR not retryable
  Implement --> Review: PASS or PASS_WITH_WARNINGS

  Review --> Review: ERROR transient retry unused
  Review --> TerminalError: ERROR not retryable
  Review --> TerminalPass: PASS and no validation warning
  Review --> TerminalPassWithWarnings: PASS and validation warning
  Review --> GateFixScope: FAIL and fix cycles under 2
  Review --> TerminalBlocked: FAIL and fix cycles at 2

  GateFixScope --> TerminalBlocked: fix out of strategy or boundary
  GateFixScope --> GateFixWaiver: fix in scope

  GateFixWaiver --> TerminalBlocked: new size waiver declined
  GateFixWaiver --> Implement: no new waiver or waiver approved ledger incremented

  TerminalPass --> [*]
  TerminalPassWithWarnings --> [*]
  TerminalNoChange --> [*]
  TerminalNeedsClarification --> [*]
  TerminalBlocked --> [*]
  TerminalError --> [*]
```

## Canonical Rules

- Multi-target: user-enumerated targets only; each target is one FSM run;
  aggregate status is the worst per the order in `state-machine.md`.
- `PASS` requires executed validation with coverage evidence and
  `REFACTOR_REVIEW: PASS`. Any validation warning caps at `PASS_WITH_WARNINGS`.
- Plan mutation starts only after plan approval unless `AUTO_APPROVE=true` was
  supplied and recorded.
- Fix loop: at most two ledgered cycles; fix-waiver is a first-class human gate.
- Transient retry: one retry only when the failure matches the operational
  criteria in `SKILL.md` / `state-machine.md`.
- Never auto-revert; failure handoffs include worktree-state when edits occurred.
