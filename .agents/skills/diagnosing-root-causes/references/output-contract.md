# Output Contract

The RCA report the skill delivers, and the rules for its terminal status. Load
this when drafting or formatting the report.

## RCA Report Template

```text
RCA Report
Status: ready | blocked | needs validation | escalated
Issue source: runtime | CI/CD | user report
Scope and blast radius:
Evidence checked (named sources — file:line, log line, command+output, commit SHA, CI job/step, doc section):
Reproduction or trace result:
Hypotheses considered (each: supporting evidence / opposing or weak evidence / named sources):
Root cause (with supporting validated evidence):
Causal chain (each link evidence-backed):
  Trigger ->
  Contributing conditions ->
  Mechanism ->
  Observed symptom
Educational explanation (plain-language WHY):
How the recommended fix resolves the root cause (not the symptom):
What to watch for next time:
Fix direction (recommendation only — no changes applied):
Verification recommendation:
Assumptions / hypotheses / unresolved gaps:
Residual risks:
Sensitive validation: not required | declined (gap documented) | approved + handed off
Human approvals required:
```

## Terminal Status Rules

Return exactly one status.

| Status | Use when |
| ------ | -------- |
| `ready` | A single root cause is supported by validated, named evidence; scope and blast radius are stated; the causal chain and educational explanation are complete with every link traceable; the fix direction is plausible and addresses the root cause; and any sensitive validation is approved and handed off or documented as a gap. |
| `blocked` | Critical evidence is missing, or required validation is unsafe or out of scope. |
| `needs validation` | Evidence is weak, contradictory, or stale, or a safer-alternative gap remains after a declined approval. |
| `escalated` | No single root cause is supported, or an approved sensitive workflow is required to proceed. |

Never use forced `ready` in place of `blocked`, `needs validation`, or
`escalated`. When the orchestration itself cannot proceed, it may also stop at
`needs_input` (missing inputs) or `error` (tooling failure) with the failure
detail and recovery action, separate from the report status above.

## Quality Bar

- Every root-cause claim and every causal-chain link cites a named source or is
  labeled an assumption, hypothesis, or unresolved gap.
- The report separates facts, assumptions, risks, blockers, recommendations, and
  unresolved questions.
- A maintainer could independently re-walk the path from cited evidence to the
  root cause.
- The educational explanation is understandable to a non-expert and explains why
  the failure happened and how the fix resolves the root cause, not the symptom.
- No protected artifact or system was modified, and no sensitive action ran
  without an explicit approval packet and human approval.
