# Diagnosing Root Causes Flow Diagram

Sync note: `SKILL.md` Execution is normative. This diagram is derived from it and must match its phases, gates, loop caps, statuses, and one-way approval branch.

```mermaid
flowchart TD
  START([Start: ISSUE and RESOURCES received]) --> INTAKE["Capture inputs; classify ISSUE_SOURCE as runtime / CI/CD / user-report; state safety tiers and untrusted-content rule; separate facts, assumptions, risks, blockers, and open questions"]
  INTAKE --> INTAKE_GATE{"ISSUE and RESOURCES usable, and user-report minimums present?"}

  INTAKE_GATE -->|no, clarification unused| CLARIFY["Ask one batched set of up to three targeted questions"]
  CLARIFY --> ANSWERED{"User answered?"}
  ANSWERED -->|yes, merge answers| DISPATCH_COLLECTOR
  ANSWERED -->|no| NEEDS_INPUT([needs-input: structured information request + resume instructions])
  INTAKE_GATE -->|no, clarification already used| NEEDS_INPUT
  INTAKE_GATE -->|yes| DISPATCH_COLLECTOR["Dispatch evidence-collector: ISSUE, ISSUE_SOURCE, RESOURCES, REPRODUCTION, ENVIRONMENT, answers, focused request if refining"]

  DISPATCH_COLLECTOR --> COLLECT_VERDICT{"COLLECT verdict"}
  COLLECT_VERDICT -->|ERROR, first| RETRY_C["Re-dispatch collector once with error note"]
  RETRY_C --> COLLECT_VERDICT
  COLLECT_VERDICT -->|ERROR, second| ERROR([error: failure detail + recovery action])
  COLLECT_VERDICT -->|NEEDS_INPUT| CLARIFY_LEFT{"Clarification batch unused?"}
  CLARIFY_LEFT -->|yes| CLARIFY
  CLARIFY_LEFT -->|no| NEEDS_INPUT
  COLLECT_VERDICT -->|BLOCKED: only Tier C could obtain it| BLOCKED([blocked: material unobtainable safely])
  COLLECT_VERDICT -->|PASS| WEAK_GATE{"Evidence base coherent enough for analysis?"}

  WEAK_GATE -->|no| NEEDS_VALIDATION([needs-validation: documented gap, weak or contradictory evidence])
  WEAK_GATE -->|yes| DISPATCH_ANALYST["Dispatch root-cause-analyst: EVIDENCE_BASE with excerpts, ISSUE, ISSUE_SOURCE, APPROVED_ACTIONS; + draft and review feedback on repair"]

  DISPATCH_ANALYST --> ANALYSIS_VERDICT{"ANALYSIS verdict"}
  ANALYSIS_VERDICT -->|ERROR, first| RETRY_A["Re-dispatch analyst once with error note"]
  RETRY_A --> ANALYSIS_VERDICT
  ANALYSIS_VERDICT -->|ERROR, second| ERROR
  ANALYSIS_VERDICT -->|NEEDS_INPUT| CLARIFY_LEFT
  ANALYSIS_VERDICT -->|NEEDS_EVIDENCE| REFINE_CAP{"Fewer than two refinement loops used?"}
  REFINE_CAP -->|yes, forward focused request| DISPATCH_COLLECTOR
  REFINE_CAP -->|no, treat as UNSUPPORTED| UNSUPPORTED_CAP
  ANALYSIS_VERDICT -->|UNSUPPORTED| UNSUPPORTED_CAP{"Fewer than two UNSUPPORTED retries used and plausible direction remains?"}
  UNSUPPORTED_CAP -->|yes, redirect analyst| DISPATCH_ANALYST
  UNSUPPORTED_CAP -->|no| ESCALATED_UNKNOWN([escalated: no supported root cause; ranked hypotheses + resolving evidence])

  ANALYSIS_VERDICT -->|NEEDS_APPROVAL| PACKET["Present approval packet verbatim: action, target, reason, risk, reversibility, safer alternative, expected evidence gain"]
  PACKET --> HUMAN_GATE{"Human approves this exact Tier C action?"}
  HUMAN_GATE -->|approved| EXTERNAL{"User executes externally and returns output during this run?"}
  EXTERNAL -->|yes, ingest output as RESOURCES| DISPATCH_COLLECTOR
  EXTERNAL -->|no| ESCALATED_HANDOFF([escalated: approved sensitive workflow handed off])
  HUMAN_GATE -->|declined| SAFER{"Safer alternative exists?"}
  SAFER -->|yes, direct analyst to it| DISPATCH_ANALYST
  SAFER -->|no| NEEDS_VALIDATION

  ANALYSIS_VERDICT -->|PASS| DISPATCH_REVIEWER["Dispatch rca-report-reviewer: RCA_REPORT_DRAFT, EVIDENCE_BASE, ISSUE_SOURCE, SKILL_ROOT; + REVIEW_SCOPE on re-review"]

  DISPATCH_REVIEWER --> REVIEW_VERDICT{"REVIEW verdict"}
  REVIEW_VERDICT -->|ERROR, first| RETRY_R["Re-dispatch reviewer once with error note"]
  RETRY_R --> REVIEW_VERDICT
  REVIEW_VERDICT -->|ERROR, second| ERROR
  REVIEW_VERDICT -->|BLOCKED| BLOCKED
  REVIEW_VERDICT -->|FAIL| REPAIR_CAP{"Fewer than three repair cycles used?"}
  REPAIR_CAP -->|yes, prior draft + failed checks only| DISPATCH_ANALYST
  REPAIR_CAP -->|no| NEEDS_VALIDATION
  REVIEW_VERDICT -->|PASS| DELIVER["Deliver RCA report: confidence + basis, root cause(s), causal chain, educational explanation, injection flags, gaps"]

  DELIVER --> READY([ready])
```

## Terminal-State Reference

| Terminal | Meaning |
| -------- | ------- |
| `ready` | Root cause(s) supported at high or medium confidence; review passed. |
| `blocked` | Material is known but unobtainable without an unapproved Tier C action, or review inputs are missing. |
| `needs-validation` | Evidence is weak, stale, or contradictory; approval was declined with no safe path; or repair cap was reached. |
| `escalated` | No supported root cause after caps, or approved Tier C work was handed off. |
| `needs-input` | Only the user can supply the missing item; no report is delivered. |
| `error` | A second consecutive tooling failure occurred in the same subagent. |
