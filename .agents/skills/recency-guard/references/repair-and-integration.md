# Repair And Integration Policy

> Read this file when a subagent has returned, when applying edits, or when
> finalizing wording. The orchestrator uses this file; subagents do not.

## Repair Cap And ERROR Retry

Use targeted repair cycles instead of rerunning the whole pipeline. Keep only
the latest concise verdict and unresolved risks in orchestrator context.

| Subagent Status | Orchestrator Action |
| --------------- | ------------------- |
| `PASS` | Continue to the next phase |
| `FAIL` | Fix the flagged claims only, then rerun that subagent on the updated draft when fewer than 2 targeted FAIL reruns have been used |
| `TOOLS_MISSING` | Keep only supportable claims and qualify freshness limits where they affect the answer |
| `ERROR` | Retry once with the same inputs; if it repeats, return a material uncertainty final |

Run the initial review once, then use at most **2 targeted reruns per
subagent** for the same draft. If material uncertainty remains after the
cap, return a material uncertainty final.

An ERROR retry is separate from a targeted FAIL rerun. Do not spend a FAIL
rerun on an unexpected tool or execution error, and do not retry ERROR more
than once for the same subagent pass.

## Confidence To Wording

| Confidence | Treatment In Final Answer |
| ---------- | ------------------------- |
| `High` | State the claim directly, no caveat needed |
| `Med` | Add light context such as `as of <date>` or `based on current documentation` when context affects action |
| `Low` | Remove, replace, or explicitly mark uncertain |

When `recency-checker` and `claim-verifier` review the same claim, **apply
the stricter result.** A claim that is current but overstated is not
acceptable.

## Source Conflicts

Mention a source conflict to the user only when it materially changes the
recommendation. Otherwise, pick the highest-tier supporting source and
apply the corresponding confidence label.

## Evidence Integration

Before the completeness check, integrate evidence in this order:

1. Apply the stricter result where `recency-checker` and `claim-verifier`
   reviewed the same claim.
2. Resolve source conflicts using the highest-tier source unless the conflict
   materially changes the recommendation.
3. Convert every remaining `High`, `Med`, or `Low` confidence label into final
   answer wording.
4. If material uncertainty remains after integration, produce a material
   uncertainty final instead of presenting unsupported certainty.

## Terminal Outcomes

| Outcome | Use When |
| ------- | -------- |
| Ready final answer | No material evidence, tool, or freshness limit remains |
| Limited final answer | The answer is useful but must name date, scope, evidence, or tool limits |
| Material uncertainty final | Repair caps, repeated ERROR, source conflict, or unavailable verification leaves uncertainty that affects action |
| Out-of-scope route | The user request requires external mutation or a high-impact action outside this read-only workflow |

## Finalization Checklist

1. Bottom line first; remove filler.
2. Qualifiers proportional to remaining uncertainty.
3. Concrete wording preserved where the user must act.
4. Verification details kept internal unless the user asks.
5. If final wording adds a new time-sensitive or decision-shaping claim,
   rerun the relevant subagent when repair capacity remains; otherwise return a
   material uncertainty final.
6. If the user asks for verification reasoning, summarize the final
   claim-level findings rather than the raw audit trail.
