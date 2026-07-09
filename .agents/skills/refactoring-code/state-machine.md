# State Machine — refactoring-code

Finite-state execution model for this skill. Mermaid SoT:
[`flow-diagram.md`](./flow-diagram.md). This table is the authoritative list of
states, transitions, guards, and terminals.

One FSM instance runs per user-enumerated target. Multi-target aggregate uses
the worst-status order below.

## States

| State | Kind | Role |
| ----- | ---- | ---- |
| `Intake` | active | Resolve `TARGET_PATH`, scope, `MAX_LINES`, `WEB_ACCESS`, `AUTO_APPROVE`, enumeration |
| `MapBehavior` | active | Dispatch `behavior-mapper`; one transient `ERROR` retry |
| `GateNoChange` | active | Human gate on `NO_CHANGE_CANDIDATE` |
| `ResolveReferences` | active | Resolve `REFERENCE_NEED` under `WEB_ACCESS` policy |
| `GateWebFetch` | active | Human gate before first fetch when `WEB_ACCESS=ask` |
| `DesignStrategy` | active | Dispatch `refactor-strategist`; one transient `ERROR` retry |
| `GateScope` | active | Scope checklist (non-goals, diagnosis trace, protected surfaces) |
| `GateSizeWaiver` | active | Human gate for size waiver beyond mechanical exemption |
| `SelectValidation` | active | Select validation contract; record warning path if unavailable |
| `GateValidationSafety` | active | Human gate for non-safe validation commands |
| `GatePlanApproval` | active | Human plan card unless `AUTO_APPROVE=true`; one strategist adjust |
| `Implement` | active | Dispatch `refactor-implementer`; one transient `ERROR` retry |
| `Review` | active | Dispatch `refactor-reviewer`; one transient `ERROR` retry |
| `GateFixScope` | active | Fix stays in strategy and protected-surface boundary |
| `GateFixWaiver` | active | Human gate when a fix needs a new size waiver; ledger increment |
| `TerminalPass` | terminal | Final `PASS` |
| `TerminalPassWithWarnings` | terminal | Final `PASS_WITH_WARNINGS` |
| `TerminalNoChange` | terminal | Final `NO_CHANGE` |
| `TerminalNeedsClarification` | terminal | Final `NEEDS_CLARIFICATION` |
| `TerminalBlocked` | terminal | Final `BLOCKED` |
| `TerminalError` | terminal | Final `ERROR` |

## Transitions

| From | To | Guard / event |
| ---- | -- | ------------- |
| `[*]` | `Intake` | run start for one target |
| `Intake` | `TerminalNeedsClarification` | `TARGET_PATH` missing or not specific after one ask |
| `Intake` | `MapBehavior` | specific `TARGET_PATH` resolved |
| `MapBehavior` | `TerminalNeedsClarification` | `BEHAVIOR_MAP: NEEDS_CLARIFICATION` |
| `MapBehavior` | `MapBehavior` | `ERROR` and plausibly transient and retry unused |
| `MapBehavior` | `TerminalError` | `ERROR` not retryable or retry exhausted |
| `MapBehavior` | `GateNoChange` | `NO_CHANGE_CANDIDATE` |
| `MapBehavior` | `ResolveReferences` | `PASS` |
| `GateNoChange` | `TerminalNoChange` | user accepts stop |
| `GateNoChange` | `ResolveReferences` | user continues; objective recorded |
| `ResolveReferences` | `GateWebFetch` | public source needed and `WEB_ACCESS=ask` |
| `ResolveReferences` | `DesignStrategy` | local / fetched / deny-safe / pre-approved path complete |
| `ResolveReferences` | `TerminalBlocked` | required source unavailable or declined and local evidence insufficient |
| `GateWebFetch` | `DesignStrategy` | approved fetch resolved, or declined/unavailable but local-safe |
| `GateWebFetch` | `TerminalBlocked` | declined or unavailable and local evidence insufficient |
| `DesignStrategy` | `TerminalNoChange` | `STRATEGY: NO_CHANGE` |
| `DesignStrategy` | `TerminalNeedsClarification` | `STRATEGY: NEEDS_CLARIFICATION` |
| `DesignStrategy` | `DesignStrategy` | `ERROR` and plausibly transient and retry unused |
| `DesignStrategy` | `TerminalError` | `ERROR` not retryable or retry exhausted |
| `DesignStrategy` | `GateScope` | `PASS` |
| `GateScope` | `TerminalBlocked` | checklist fails |
| `GateScope` | `GateSizeWaiver` | checklist passes |
| `GateSizeWaiver` | `TerminalBlocked` | size waiver declined |
| `GateSizeWaiver` | `SelectValidation` | no waiver needed, mechanical exemption, or waiver approved |
| `SelectValidation` | `GateValidationSafety` | command available |
| `SelectValidation` | `GatePlanApproval` | warning path recorded (no command) |
| `GateValidationSafety` | `GatePlanApproval` | safe, approved, or user chooses warning path |
| `GateValidationSafety` | `TerminalBlocked` | unsafe declined without warning path |
| `GatePlanApproval` | `Implement` | `AUTO_APPROVE=true` recorded, or user approves plan |
| `GatePlanApproval` | `TerminalNeedsClarification` | user declines, or second adjust requested |
| `GatePlanApproval` | `DesignStrategy` | first adjust; redispatch strategist once |
| `Implement` | `TerminalBlocked` | `IMPLEMENTATION: BLOCKED` (include worktree-state) |
| `Implement` | `Implement` | `ERROR` and plausibly transient and retry unused |
| `Implement` | `TerminalError` | `ERROR` not retryable or retry exhausted (include worktree-state) |
| `Implement` | `Review` | `PASS` or `PASS_WITH_WARNINGS` |
| `Review` | `Review` | `ERROR` and plausibly transient and retry unused |
| `Review` | `TerminalError` | `ERROR` not retryable or retry exhausted |
| `Review` | `TerminalPass` | `REFACTOR_REVIEW: PASS` and no validation warning |
| `Review` | `TerminalPassWithWarnings` | `REFACTOR_REVIEW: PASS` and validation warning recorded |
| `Review` | `GateFixScope` | `FAIL` and fix cycles used `< 2` |
| `Review` | `TerminalBlocked` | `FAIL` and fix cycles used `>= 2` (worktree-state) |
| `GateFixScope` | `TerminalBlocked` | required fix crosses strategy or protected surfaces |
| `GateFixScope` | `GateFixWaiver` | fix stays in strategy and boundary |
| `GateFixWaiver` | `TerminalBlocked` | new size waiver required and declined |
| `GateFixWaiver` | `Implement` | no new waiver, or waiver approved; ledger incremented; validation reclassified |
| `TerminalPass` | `[*]` | emit success handoff |
| `TerminalPassWithWarnings` | `[*]` | emit success handoff with warning first |
| `TerminalNoChange` | `[*]` | emit stop handoff |
| `TerminalNeedsClarification` | `[*]` | emit stop handoff |
| `TerminalBlocked` | `[*]` | emit stop handoff; never auto-revert |
| `TerminalError` | `[*]` | emit stop handoff; never auto-revert |

## Human gates

| Gate state | When | Outcomes |
| ---------- | ---- | -------- |
| `GateNoChange` | Mapper `NO_CHANGE_CANDIDATE` | accept → `NO_CHANGE`; continue → record objective |
| `GateWebFetch` | `WEB_ACCESS=ask` before first fetch | approve → fetch; deny → local-safe or `BLOCKED` |
| `GateSizeWaiver` | Size waiver beyond mechanical exemption | approve → continue; decline → `BLOCKED` |
| `GateValidationSafety` | Command not `safe` | approve / warning path / `BLOCKED` |
| `GatePlanApproval` | Before mutation unless `AUTO_APPROVE=true` | approve / decline / adjust once |
| `GateFixWaiver` | Fix needs a new size waiver | approve → re-implement; decline → `BLOCKED` |

## Plausibly transient (retry predicate)

Retry a subagent `ERROR` **once** only when all hold:

1. No approved plan mutation has been partially applied in a conflicting way for
   this dispatch (mapper/strategist: always eligible; implementer/reviewer: only
   if the error is tool/runtime and the report marks `transient`).
2. The failure looks like timeout, cancelled tool, unavailable VCS metadata, or
   other infrastructure flake — not a logic, scope, or contract failure.
3. The retry for that subagent dispatch has not already been used.

Otherwise route to `TerminalError` (or `TerminalBlocked` when the subagent
status is `BLOCKED`).

## Multi-target aggregate (worst status)

When the user enumerates multiple targets, run one FSM instance per target in
order. Plan approval may be batched. Final reports stay per-target. Aggregate
status is the **worst** status in this order (worst first):

1. `ERROR`
2. `BLOCKED`
3. `NEEDS_CLARIFICATION`
4. `NO_CHANGE`
5. `PASS_WITH_WARNINGS`
6. `PASS`

## Subagent → final status mapping

Preserve the mapping layer; do not collapse enums.

| Subagent prefix | Statuses | Orchestrator routing |
| --------------- | -------- | -------------------- |
| `BEHAVIOR_MAP` | `PASS`, `NO_CHANGE_CANDIDATE`, `NEEDS_CLARIFICATION`, `ERROR` | map / no-change gate / terminals |
| `STRATEGY` | `PASS`, `NO_CHANGE`, `NEEDS_CLARIFICATION`, `ERROR` | strategy / terminals |
| `IMPLEMENTATION` | `PASS`, `PASS_WITH_WARNINGS`, `BLOCKED`, `ERROR` | review or failure terminals |
| `REFACTOR_REVIEW` | `PASS`, `FAIL`, `ERROR` | success terminals or fix loop |

## Reachability and dead-state checks

| Property | Result |
| -------- | ------ |
| Every active state reachable from `Intake` | yes |
| Every terminal reachable | yes |
| Dead states (no outgoing, non-terminal) | none |
| Fix loop bounded | yes — max 2 ledgered cycles via `GateFixScope` / `GateFixWaiver` → `Implement` |
| Transient retries bounded | yes — one per subagent dispatch |

## Terminal decisions

Exactly one final status per target: `PASS`, `PASS_WITH_WARNINGS`, `NO_CHANGE`,
`NEEDS_CLARIFICATION`, `BLOCKED`, `ERROR`.
