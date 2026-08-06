# Conversation Protocol

> Read this file only when Stage 4 begins or when assembling the final clarification summary. Mode-specific artifact paths stay in `./upfront-mode.md` and `./critique-mode.md`.
>
> **Reminder:** This is the local execution contract. Fetch optional background from `./external-sources.md` only when the developer asks why a questioning pattern is being used.

## When To Fetch Background

The workflow runs offline from this file. Fetch one matching URL from `./external-sources.md` only when the developer asks why a questioning pattern, staged reveal, or trust-boundary rule is being applied.

## Preview Manifest

Before asking the first question, show the manifest header counts and the `## Questions For Now` table shape returned by `question-manifest-builder`. Do not invent a second preview schema. The manifest has already applied the `HIGH` or higher user-surfacing gate; do not add lower-severity items to the preview or question loop.

If `critique-analyzer` or `question-manifest-builder` returned `WARN`, include a one-line warning summary before the preview table. Keep the raw subagent details out of the conversation layer.

```text
## Question Manifest - <TICKET_KEY>[ / Task <TASK_NUMBER>]

Questions now: <N> | Deferred: <M> | Irrelevant: <R>

| # | Item ID | Category | Severity | Model | Skippable | Affects |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PF1 | Problem framing | HIGH | A | No | All |
```

For upfront `Model=A` rows, do not preview the per-item `Brief` blocks yet. The developer answers before seeing the critique.

If `Questions now: 0`, say so clearly, skip the question loop, and go to Stage 5 with an empty decision list.

After a non-empty preview, ask:

```text
Ready to start? I'll walk through these one at a time.
```

## Turn Header

Show progress on every item.

```text
Question <current>/<total> - [<category>]
```

Ask exactly one manifest item per message. Keep the manifest `Item ID` unchanged in the decision record.

## Model A - Tier 3 Problem Framing

Use Model A only for upfront problem-framing hard gates.

1. Name the challenged gap and why it matters for this ticket.
2. Ask the developer to answer in their own words before showing the critique.
3. If the answer is shallow, state the missing evidence, user, or need.
4. Reveal the critique-analyzer finding and compare perspectives.
5. Ask for the final decision and rationale.

Tier 3 items cannot be skipped. If the developer needs more information, record the outcome as `blocked` and stop after Stage 5 records the blocker.

## Model B - Standard Clarification

Use Model B for critique items, user-impact items, assumptions, cross-cutting questions, validation items, and deferred task questions.

1. Present the original decision or unresolved question.
2. Present the critique, trade-off, or clarifying context from the manifest.
3. Ask whether the reasoning holds up and why.
4. Record the final decision and rationale.

## Response Choices

When the interface supports structured choices, use the smallest fitting set. Otherwise use numbered options.

| Item type | Choices |
| --- | --- |
| Critique or user-impact item | `Keep current approach`; `Switch to <alternative>`; `I need more information`; `Acknowledge but proceed` |
| Assumption | `Confirm`; `Revise`; `Skip` |
| Open question or deferred question | Free-text answer; `Skip` when `Skippable=Yes` |
| Validation item | `Resolved`; `Action needed` |

Treat `I need more information` and `Action needed` as the canonical `blocked` outcome for the recorder.

## Recording Rules

Maintain only the active manifest item, developer response, decision list, `RE_PLAN_NEEDED`, `BLOCKERS_PRESENT`, and critique artifact path in the conversation layer.

| Response | Recording effect |
| --- | --- |
| `Switch to <alternative>` or `Revise` | `outcome=revised`; set `RE_PLAN_NEEDED=true` |
| `blocked` | set `RE_PLAN_NEEDED=true`; set `BLOCKERS_PRESENT=true`; stop after recording the blocker |
| `Acknowledge but proceed` | `outcome=override`; no re-plan |
| `Skip` on a skippable item | record fallback and warning |
| New current-scope question | append to the live manifest before asking |
| New future-task question | add to `DEFERRED_QUESTIONS` |

Follow the manifest `Skippable` field. Tier 3 hard gates and items marked `Skippable=No` are not skipped.

## Stage 5 Handoff

Use the active mode playbook for the exact `decision-recorder` dispatch inputs. Pass resolved decisions, deferred questions, implementation updates, and critique-mode task metadata when present.

The recorder owns file writes and validation. The conversation layer owns only the final user-facing summary.

## Final Summary

Start every final summary with these four fields in this order:

```text
- Critique artifact: <path>
- Files updated: <path list or ->
- RE_PLAN_NEEDED: <true|false>
- BLOCKERS_PRESENT: <true|false>
```

Then add the parent-retained mode field:

```text
- Accepted decisions summary: <concise summary or ->
- Decisions file: docs/<KEY>-task-<N>-decisions.md | -
```

Use only the line for the active mode. If the run stops early because inputs are invalid or a subagent returns `BLOCKED`, `FAIL`, or `ERROR`, keep the first four fields in order with `Files updated: -`, then the blocking pair, then the mode field when a value is available:

```text
- Critique artifact: <path or ->
- Files updated: -
- RE_PLAN_NEEDED: <true|false>
- BLOCKERS_PRESENT: true
- Blocking verdict: <verdict>
- Reason: <reason>
- <Accepted decisions summary | Decisions file>: <value>
```

The mode field is always last, after the blocking pair. `SKILL.md` holds the Flag Transitions table that determines both flag values.

For upfront mode, add useful counts such as:

```text
- Questions resolved: <N>
- Questions skipped: <N>
- Questions deferred: <N>
- Blocking items: <N>
- Overrides: <N>
- Plan-changing decisions: <N>
```

For critique mode, add useful counts such as:

```text
- Critique items resolved: <N>
- User-impact items resolved: <N>
- Deferred questions resolved: <N>
- Questions marked irrelevant: <N>
- Blocking items: <N>
- Overrides: <N>
```

If `RE_PLAN_NEEDED=true`, tell the parent workflow to re-run the relevant planning phase before execution. If `BLOCKERS_PRESENT=true`, tell it to stop before execution and escalate unresolved items.
