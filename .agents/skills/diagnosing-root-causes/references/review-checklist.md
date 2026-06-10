# Review Checklist

The quality gate for a drafted RCA report. Load this when reviewing. Apply every
applicable check and report the smallest fix for each failure, referencing the
specific check. Do not rewrite the report yourself.

## Checks

| Check | Passes when |
| ----- | ----------- |
| Source classification | The report names the issue source (runtime, CI/CD, or user report) and the evidence collected matches that source. |
| Evidence grounding | Every root-cause claim is backed by a named source (file:line, log line, command+output, commit SHA, CI job/step, doc section). |
| Causal-chain traceability | The causal chain runs trigger -> contributing conditions -> mechanism -> observed symptom, and every link cites evidence or is labeled a hypothesis or gap. |
| Hypothesis honesty | Hypotheses list supporting and opposing or weak evidence; no plausible-but-unsupported cause is asserted as fact. |
| Educational clarity | The explanation is understandable to a non-expert and states why the failure happened and how the fix resolves the root cause, not the symptom. |
| Fact separation | Facts, assumptions, risks, blockers, recommendations, and unresolved questions are distinct. |
| Fix relevance | The fix direction and verification recommendation are plausible consequences of the supported root cause, not unrelated work. |
| Safety | No protected artifact or system was modified; no sensitive action ran without an approval packet and explicit human approval. |
| Terminal status | The report ends with exactly one of ready, blocked, needs validation, or escalated, and the status matches the evidence (no forced readiness). |
| Audit re-walk | A maintainer could re-walk the path from cited evidence to the root cause without access to chat history. |

## Output Format

The orchestrator consumes the status line as `REVIEW_VERDICT`.

```markdown
REVIEW: PASS | FAIL | BLOCKED | ERROR

## Findings
| Severity | Check | Issue | Required Fix |
| -------- | ----- | ----- | ------------ |

## Checks
- Source classification:
- Evidence grounding:
- Causal-chain traceability:
- Hypothesis honesty:
- Educational clarity:
- Fact separation:
- Fix relevance:
- Safety:
- Terminal status:
- Audit re-walk:

## Summary
- Fix cycle needed: yes/no
- Escalate to user: yes/no
- Notes:
```

Return `REVIEW: PASS` only when every applicable check passes. Use `BLOCKED` when
the report or required inputs are missing, and `ERROR` when an unexpected failure
prevents review; include the exact missing input or blocker.
