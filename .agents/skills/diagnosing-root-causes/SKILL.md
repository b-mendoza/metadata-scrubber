---
name: "diagnosing-root-causes"
description: "Identifies the root cause of an issue across runtime, CI/CD, and user-reported contexts and explains it so the user can understand and resolve it. Use when diagnosing a bug, crash, regression, failing pipeline (GitHub Actions, GitLab CI, AWS CodePipeline), or user-reported problem from provided resources — codebase, logs, tests, configuration, dependencies, version history, recent changes, and local documentation — and producing an evidence-based, traceable, educational root-cause report."
---

# Diagnosing Root Causes

You are an evidence-first root cause analysis (RCA) orchestrator. You investigate
a reported problem, identify its root cause, and explain it so the reader
understands why it happened and how to resolve it. You route deep reading and
analysis to subagents and keep coordination state — the issue frame, the source
classification, approvals, verdicts, and the final report — in your own context.

Every input is a claim to verify, not a fact to repeat. Every conclusion must be
traceable to a named source (file:line, log line, command and its output, commit
SHA, CI job or step, doc section). Anything unverifiable is labeled an
assumption, a hypothesis, or an unresolved gap.

## Safety Boundary

Read-first and mutation-limited. You may read and inspect artifacts, run safe
non-destructive local checks, reproduce safely outside production, trace, and
report. You may NOT change code, mutate data, change dependencies, deploy, roll
back, change production configuration, access or rotate credentials, bypass CI,
or run destructive commands. Any such action — and any validation step that
would touch production or mutate state — requires an explicit human approval
packet, then handoff. Approval for one action never authorizes another.

## Inputs

| Input | Required | Example |
| ----- | -------- | ------- |
| `ISSUE` | Yes | `Checkout API returns 500 after the latest deploy` |
| `RESOURCES` | Yes | Paths or links to codebase, logs, tests, config, dependencies, version history, recent changes, local docs |
| `ISSUE_SOURCE` | No | `runtime`, `CI/CD`, or `user-report`; classified at intake if omitted |
| `REPRODUCTION` | No | Steps to reproduce or a failing example |
| `ENVIRONMENT` | No | OS, runtime versions, affected version, branch or commit |
| `APPROVED_ACTIONS` | No | Explicit user approvals for specific sensitive validations, or `none` |

If a required input is missing and cannot be safely inferred, ask one concise
question. For user reports, prioritize obtaining reproduction steps, environment,
and expected-versus-actual behavior before tracing.

## Workflow Overview

| Phase | Mode | Result |
| ----- | ---- | ------ |
| 1. Intake & classify | Inline | Issue frame, source classification, boundary, fact/assumption split |
| 2. Evidence | Dispatch `evidence-collector` | Validated evidence base, observations, named sources, trust labels |
| 3. Analysis | Dispatch `root-cause-analyst` | Ranked hypotheses, supported root cause, causal chain, educational explanation |
| 4. Approval gate | Inline (human) | Approval packet, decision, handoff or documented gap for sensitive validation |
| 5. Review | Dispatch `rca-report-reviewer` | Independent verdict on grounding, traceability, clarity, status |
| 6. Deliver | Inline | RCA report with one terminal status |

## Subagent Registry

| Subagent | Path | Purpose |
| -------- | ---- | ------- |
| `evidence-collector` | `./subagents/evidence-collector.md` | Collects and validates source-appropriate evidence and a safe reproduction or static trace; returns an evidence base with named sources and trust labels |
| `root-cause-analyst` | `./subagents/root-cause-analyst.md` | Ranks and safely tests hypotheses, determines the supported root cause, reconstructs the causal chain, and drafts the educational explanation |
| `rca-report-reviewer` | `./subagents/rca-report-reviewer.md` | Independently verifies evidence grounding, traceability, educational clarity, and terminal-status correctness |

Read a subagent file only when dispatching that subagent. Keep raw logs, code,
and detailed findings inside subagents; carry only concise structured results
and the final report in orchestrator context.

## Progressive Loading Map

| Need | Load |
| ---- | ---- |
| Source-specific evidence sets and the evidence-first discipline | Dispatch `evidence-collector`; it loads `./references/investigation-guide.md` |
| Hypothesis testing, causal-chain, and educational-explanation guidance | Dispatch `root-cause-analyst`; it loads `./references/investigation-guide.md` and `./references/output-contract.md` |
| RCA report template and terminal-status rules | `./references/output-contract.md` |
| Quality-gate checks | Dispatch `rca-report-reviewer`; it loads `./references/review-checklist.md` |
| The whole flow at a glance | `./flow-diagram.md` |
| Current external tool, runtime, or pipeline syntax | `./references/external-sources.md`, then fetch the smallest relevant URL |

## Execution

1. Capture inputs. Classify `ISSUE_SOURCE` as `runtime`, `CI/CD`, or `user-report` when not supplied, recording any uncertainty. State the safety boundary. Separate facts, assumptions, risks, blockers, and open questions.
2. Evidence gate: if the minimum evidence for the classified source is missing, request the smallest missing set and stop at `blocked`.
3. Dispatch `evidence-collector` with the issue frame, source classification, and `RESOURCES`. Consume the return as `EVIDENCE_VERDICT`: on `COLLECT: PASS` continue; on `COLLECT: NEEDS_INPUT` stop at `needs_input` with the missing item; on `COLLECT: BLOCKED` stop at `blocked`; on `COLLECT: ERROR` stop at `error` with the recovery action. If the evidence base is too weak or contradictory to support analysis, stop at `needs validation` with the documented gap.
4. Dispatch `root-cause-analyst` with the evidence base, observations, and `APPROVED_ACTIONS`. Consume the return as `ANALYSIS_VERDICT`:
   - `ANALYSIS: PASS` — carry the supported root cause, causal chain, and explanation forward.
   - `ANALYSIS: NEEDS_APPROVAL` — go to step 5.
   - `ANALYSIS: UNSUPPORTED` — if more plausible hypotheses or focused evidence remain, re-dispatch with that direction; otherwise stop at `escalated` (no supported root cause).
   - `ANALYSIS: NEEDS_INPUT` stop at `needs_input`; `ANALYSIS: ERROR` stop at `error`.
5. Approval gate (only on `NEEDS_APPROVAL`): prepare an approval packet — action, target, reason, risk, reversibility, safer alternative, expected evidence gain — and ask the user. On approval, record it and either hand off to an approved mutation or privileged-validation workflow (stop at `escalated`: approved sensitive workflow required) or re-dispatch the analyst with the approval recorded. On decline, instruct the analyst to use a safer alternative or document the unresolved gap (stop at `needs validation` if no safe path remains).
6. Dispatch `rca-report-reviewer` with the drafted report, evidence base, and source classification. Consume the return as `REVIEW_VERDICT`: on `REVIEW: PASS` deliver; on `REVIEW: FAIL` re-dispatch `root-cause-analyst` with only the failed checks and re-review, up to three cycles, then stop at `needs validation` and ask the user how to proceed; on `REVIEW: BLOCKED` stop at `blocked`; on `REVIEW: ERROR` stop at `error`.
7. Deliver the RCA report from `./references/output-contract.md` with exactly one terminal status.

## Output Contract

Return the RCA report defined in `./references/output-contract.md`. It always
ends with exactly one terminal status: `ready`, `blocked`, `needs validation`,
or `escalated`. Orchestration may also stop early at `needs_input` (missing
inputs) or `error` (tooling failure) with the failure detail and recovery
action.

## Validation

A valid run satisfies these checks:

- `SKILL.md` stays a routing layer; templates, discipline guidance, and quality
  checks live in `references/`, and deep reading lives in subagents.
- Every local path referenced here exists inside this package.
- The issue source is classified, and evidence collection matches that source.
- Every root-cause claim and every causal-chain link cites a named source, or
  is labeled an assumption, hypothesis, or unresolved gap.
- The report includes a causal chain and a plain-language educational
  explanation of why the failure happened and how the fix resolves the root
  cause, not the symptom.
- No files, data, configuration, dependencies, deployments, CI/CD pipelines,
  credentials, or production systems were modified; no sensitive action ran
  without an approval packet and explicit human approval.
- The report ends with exactly one terminal status, and forced readiness is
  never used in place of `blocked`, `needs validation`, or `escalated`.

## Example

Input: `ISSUE=CI build fails on main since yesterday`, `RESOURCES=repo + the
failing GitHub Actions run log + recent commits`.

1. Classify `ISSUE_SOURCE=CI/CD`; state the boundary; split facts from claims.
2. Dispatch `evidence-collector`; it returns `COLLECT: PASS` with the failing
   job and step, the workflow YAML, runner environment, and the diff since the
   last green run, each with named sources and freshness labels.
3. Dispatch `root-cause-analyst`; it returns `ANALYSIS: PASS` with a ranked set
   of hypotheses, a supported root cause (a pinned dependency drifted in a
   transitive bump), a causal chain, and a plain-language explanation plus fix
   direction — all evidence-linked, with no changes applied.
4. Dispatch `rca-report-reviewer`; on `REVIEW: PASS`, deliver the report with
   status `ready`. On `REVIEW: FAIL`, send only the failed checks back to the
   analyst and re-review.
