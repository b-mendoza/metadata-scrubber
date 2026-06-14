# Dispatch Example

This example is illustrative. On any mismatch, the subagent contracts and
[`data-contracts.md`](./data-contracts.md) win. [F-12]

## Scenario

Inputs:

- `TARGET_FILE=docs/auth-handoff.md`
- `SUBJECT=Authentication review`
- `CONTEXT_SOURCE=current conversation`
- `TRACKING_FILES=docs/auth-plan.md`
- Existing target found; user chooses `update`

The orchestrator copies `docs/auth-handoff.md` to `docs/auth-handoff.prev.md`,
records `PRIOR_HANDOFF_FILE=docs/auth-handoff.md`, snapshots the conversation to
`docs/auth-handoff.transcript.md`, resolves bundled reference paths to absolute
paths, and dispatches stages.

## Context Extractor Summary

```text
CONTEXT: PASS
File: docs/auth-handoff.context.json
Instruction blocks: 3
Q&A exchanges: 4
Amendments: 2
Reason: Extracted active mandate and carried forward one prior open question.
```

Orchestrator verification: file exists, non-empty, JSON parses, required context
keys are present.

## Insights Summary With Verification Rerun

First response:

```text
INSIGHTS: PASS
File: docs/auth-handoff.insights.json
Insights: 5
Critical: 1
Unverified or partial: 2
Reason: Extracted evidence-backed decisions and risks.
```

Mechanical verification fails because `summary` is missing. The orchestrator
reruns `insight-documenter` once and names the discrepancy.

Second response:

```text
INSIGHTS: PASS
File: docs/auth-handoff.insights.json
Insights: 5
Critical: 1
Unverified or partial: 2
Reason: Rewrote artifact with required top-level summary key.
```

## Claims Summary

```text
CLAIMS: WARN
File: docs/auth-handoff.claims.json
Claims checked: 8
Verified: 5
Refuted: 1
Partial: 1
Unverified: 1
Reason: One referenced tracking file claim had no reachable authoritative source.
```

Warnings force warn, not pass. [F-10]

## Handoff Summary

```text
HANDOFF: PASS
File: docs/auth-handoff.md
Sections: 5
Open questions: 2
Quality flags: 0
Reason: Rendered five required sections, working-artifacts manifest, and update-mode resolved history.
```

## Review Summary

```text
REVIEW: WARN
File: docs/auth-handoff.md
Failed gates: 0
Rerun: none
Open questions: 2
Warnings: 1
Reason: Claims validation contains one unverified external claim; handoff remains usable.
```

The orchestrator returns `Completed: review pass` with warn status disclosed in
the run report, paths to `TARGET_FILE`, transcript, context, insights, claims,
and `.prev.md`, plus counts and warnings.
