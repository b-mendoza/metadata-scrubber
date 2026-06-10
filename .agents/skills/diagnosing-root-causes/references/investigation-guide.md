# Investigation Guide

The operating discipline for evidence collection and root-cause analysis. Load
this when collecting evidence or analyzing a root cause.

## Evidence-First Discipline

- Treat every input — issue reports, user descriptions, logs, CI/CD output,
  tests, code, config, dependency metadata, version history, recent changes,
  local docs — as a claim to verify, not a fact to repeat.
- Tie every conclusion and every causal-chain link to a named source: file:line,
  log line, command and its output, commit SHA, CI job or step, or doc section.
- Label anything unverifiable as an assumption, a hypothesis, or an unresolved
  gap. Do not promote a plausible narrative to a fact.
- Keep facts, assumptions, risks, blockers, recommendations, and open questions
  distinct at every step.
- Prefer direct evidence and reproducible observations over inference. When you
  must infer, say so and state what would confirm it.

## Safety Boundary

Read-first and mutation-limited. Allowed: read and inspect artifacts, run safe
non-destructive local checks, reproduce safely outside production, trace, and
report. Not allowed without an explicit human approval packet: code changes,
data mutations, dependency changes, deploy, rollback, production config changes,
credential access or rotation, CI bypass, destructive commands, or any
validation that would touch production or mutate state. Approval for one action
never authorizes another.

## Source Classification

Classify the issue source first; it determines the primary evidence set.

| Source | Signals | Primary evidence |
| ------ | ------- | ---------------- |
| `runtime` | Crash, exception, wrong behavior, performance regression in a running codebase | Stack traces, application logs, failing behavior, code paths, configuration, data shape, dependencies, recent changes |
| `CI/CD` | A pipeline failed (GitHub Actions, GitLab CI, AWS CodePipeline, etc.) | Failing job and step logs, pipeline config (e.g. workflow YAML), runner environment, dependency lockfile drift, recent changes to pipeline or deps, diff since last green run |
| `user-report` | A person reports a problem, often underspecified | Clarified reproduction steps, environment, versions, and expected-vs-actual; then supporting code, logs, and config |

When the source is ambiguous, record the uncertainty and gather evidence for the
most likely source first; revise if the evidence points elsewhere.

## Evidence Validation

For each artifact, check and record:

- **Freshness** — does it reflect the current code/config/version, or is it
  stale?
- **Source reliability** — primary artifact vs. secondhand summary or reporter
  claim.
- **Environment match** — does it come from the environment where the issue
  occurs?
- **Affected version** — which version, branch, or commit does it describe?
- **Contradictions** — does it conflict with other evidence? Note the conflict
  rather than silently picking a side.

If the evidence base is too weak, stale, or contradictory to support analysis,
stop and report `needs validation` with the documented gap.

## Reproduction and Tracing

- Reproduce safely outside production when possible: a focused non-destructive
  reproduction, local test, log or pipeline-log inspection, or configuration
  comparison.
- When reproduction is unsafe or impossible, trace statically from symptoms
  through code, configuration, data shape, dependencies, and recent changes.
- Record: expected behavior, actual behavior, error boundary, triggering
  condition, and the likely execution path, each with named sources.

## Hypothesis Testing

1. Form ranked hypotheses. For each: supporting evidence, opposing or weak
   evidence, named sources, and assumptions.
2. Test the top hypothesis with only safe, non-destructive checks that can raise
   or lower confidence.
3. If validating the top hypothesis would require a sensitive or
   production-touching action, stop and request an approval packet instead of
   proceeding.
4. If no single root cause is supported, test the next plausible hypothesis,
   request focused additional evidence, or report that the root cause is
   unsupported. Do not force a single cause.

## Causal Chain

Once a single root cause is supported with adequate confidence and blast radius,
reconstruct the causal chain and tie each link to named evidence:

```
trigger -> contributing conditions -> mechanism -> observed symptom
```

If a link cannot be supported by evidence, label it a hypothesis or unresolved
gap rather than asserting it.

## Educational Explanation

Beyond naming the root cause, produce an explanation the reader can learn from:

- **Why** the failure happened, in plain language a non-expert can follow.
- **How** the recommended fix resolves the root cause rather than suppressing
  the symptom.
- **What to watch for** so the reader can recognize or prevent similar issues.

The explanation must stay traceable: every claim still maps to evidence. An
explanation that is clear but unsupported, or supported but unreadable, is not
done.

## Fix Direction

Recommend a fix direction and a verification path that are plausible
consequences of the supported root cause — not unrelated implementation work. No
changes are applied by this skill; the fix is a recommendation for a separate,
approved workflow.
