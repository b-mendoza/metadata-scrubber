# Flow Diagram

Canonical execution model: finite state machine. Guards, loop caps, and
terminals are tabulated in [`state-machine.md`](./state-machine.md).
`SKILL.md` Execution must match this diagram.

```mermaid
stateDiagram-v2
  [*] --> Intake

  Intake --> CollectEvidence: inputs usable
  Intake --> Clarify: needs clarify and clarify_token
  Intake --> TermNeedsInput: needs clarify and no token

  Clarify --> CollectEvidence: user answered
  Clarify --> TermNeedsInput: declined or silent

  CollectEvidence --> CoherenceCheck: COLLECT PASS
  CollectEvidence --> Clarify: NEEDS_INPUT and clarify_token
  CollectEvidence --> TermNeedsInput: NEEDS_INPUT and no token
  CollectEvidence --> TermBlocked: COLLECT BLOCKED
  CollectEvidence --> RetryCollect: COLLECT ERROR first
  CollectEvidence --> TermError: COLLECT ERROR second

  RetryCollect --> CollectEvidence: redispatch with error note

  CoherenceCheck --> Analyze: coherent and fresh enough
  CoherenceCheck --> TermNeedsValidation: contradictory or stale beyond affected version

  Analyze --> Review: ANALYSIS PASS
  Analyze --> PresentApproval: NEEDS_APPROVAL
  Analyze --> CollectEvidence: NEEDS_EVIDENCE and refine_loops under 2
  Analyze --> Analyze: UNSUPPORTED or refine over cap and unsupported under 2
  Analyze --> TermEscalated: UNSUPPORTED or refine over cap and unsupported exhausted
  Analyze --> Clarify: NEEDS_INPUT and clarify_token
  Analyze --> TermNeedsInput: NEEDS_INPUT and no token
  Analyze --> RetryAnalyze: ANALYSIS ERROR first
  Analyze --> TermError: ANALYSIS ERROR second

  RetryAnalyze --> Analyze: redispatch with error note

  PresentApproval --> AwaitExternal: approved Tier C packet
  PresentApproval --> Analyze: declined and safer alternative
  PresentApproval --> TermNeedsValidation: declined and no safer path

  AwaitExternal --> CollectEvidence: external output returned
  AwaitExternal --> TermEscalated: handoff only

  Review --> Deliver: REVIEW PASS
  Review --> RepairAnalyze: FAIL and repair_cycles under 3
  Review --> TermNeedsValidation: FAIL and repair cap
  Review --> TermBlocked: REVIEW BLOCKED
  Review --> RetryReview: REVIEW ERROR first
  Review --> TermError: REVIEW ERROR second

  RetryReview --> Review: redispatch with error note
  RepairAnalyze --> Review: repaired draft plus REVIEW_SCOPE

  Deliver --> TermReady: status ready
  Deliver --> TermBlocked: status blocked
  Deliver --> TermNeedsValidation: status needs-validation
  Deliver --> TermEscalated: status escalated

  TermReady --> [*]
  TermBlocked --> [*]
  TermNeedsValidation --> [*]
  TermEscalated --> [*]
  TermNeedsInput --> [*]
  TermError --> [*]
```

## Gate And Branch Summary

| Gate | Guard | Pass path | Stop / alternate |
| ---- | ----- | --------- | ---------------- |
| Intake usability | `ISSUE`/`RESOURCES` usable; `user-report` minimums when applicable | `CollectEvidence` | `Clarify` if token left; else `TermNeedsInput` |
| Clarify budget | `clarify_token` unused | One batch ≤3 questions | Later `NEEDS_INPUT` → `TermNeedsInput` |
| Collect verdict | `COLLECT: PASS` | `CoherenceCheck` | `Clarify` / `TermNeedsInput` / `TermBlocked` / retry / `TermError` |
| Coherence | Not mutually contradictory **and** not stale beyond affected version | `Analyze` | `TermNeedsValidation` |
| Analyze verdict | `ANALYSIS: PASS` | `Review` | Approval branch, refine, unsupported, clarify, retry, or terminal |
| Approval (conditional) | `ANALYSIS: NEEDS_APPROVAL` only | `AwaitExternal` if approved | Safer alternative → `Analyze`; else `TermNeedsValidation` |
| Tier C rule | Never execute Tier C | Handoff packet only | `TermEscalated` unless external output ingested |
| Review verdict | `REVIEW: PASS` | `Deliver` | Repair (cap 3), `TermNeedsValidation`, `TermBlocked`, retry, or `TermError` |

## Terminal States

| Terminal | Meaning |
| -------- | ------- |
| `TermReady` | Root cause(s) at high or medium confidence; review passed. |
| `TermBlocked` | Material unobtainable without unapproved Tier C, or review inputs missing. |
| `TermNeedsValidation` | Contradictory/stale evidence; declined approval with no safe path; or repair cap. |
| `TermEscalated` | No supported root cause after caps, or approved Tier C handed off. |
| `TermNeedsInput` | Only the user can supply the missing item; no RCA report. |
| `TermError` | Second consecutive tooling failure in the same subagent; no RCA report. |
