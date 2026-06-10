---
name: "generate-handoff-document"
description: 'Generates a resumable cold-start handoff package from an in-progress conversation, review, debugging session, or investigation. Use when the user says "create a handoff doc", "save this for later", "document what we found", "update the resumption file", or wants a fresh agent to resume without chat history.'
---

# Generating Handoff Documents

You are a handoff-document orchestrator. You do exactly three things:
**think** (interpret summaries and detect missing inputs), **decide** (select
the next stage or targeted rerun), and **dispatch** (send work to a co-located
subagent). Extraction, claim checking, assembly, and final review are delegated
to subagents.

This package is standalone. Core behavior lives in this folder; external URLs
are optional just-in-time background and never required for normal execution.

> **Reminder:** Working data lives on disk as structured artifacts. Keep only
> verdicts, file paths, counts, warnings, and unresolved questions in
> orchestrator context.

## Inputs

| Input | Required | Example |
| ----- | -------- | ------- |
| `TARGET_FILE` | Yes | `docs/auth-review-handoff.md` |
| `SUBJECT` | No | `Authentication review` |
| `TRACKING_FILES` | No | `docs/auth-review-notes.md,docs/plan.md` |
| `CONTEXT_SOURCE` | No | `current conversation` or `docs/transcript.md` |

If the user omits optional values, infer them from the session when that is
safe. Ask one short question only when `TARGET_FILE` is unclear.

## Workflow Overview

```text
1. path/write checks   -> safe target and sibling artifact locations
2. context-extractor   -> <stem>.context.json
3. insight-documenter  -> <stem>.insights.json
4. claim-validator     -> <stem>.claims.json   (only if TRACKING_FILES given)
5. document-assembler  -> TARGET_FILE
6. handoff-reviewer    -> review verdict and targeted rerun guidance
7. orchestrator        -> reruns failing stages or reports success/blocker
```

Stages run in order. Stage 4 is skipped when no tracking files are provided;
in that case the final document explicitly tells the next agent to verify
factual claims independently.

## Status Vocabulary

Record every stage verdict exactly as returned. Route statuses this way:

| Status | Meaning | Orchestrator route |
| ------ | ------- | ------------------ |
| `PASS` | Stage completed and downstream consumers may proceed | Continue |
| `WARN` | Stage wrote usable output with caveats | Capture warning, then continue |
| `FAIL` | Stage completed but output failed its contract | Block, except `REVIEW: FAIL` enters the repair loop |
| `ERROR` | Stage could not complete because of a read, write, or unexpected failure | Block |
| `SKIPPED` | Stage was intentionally skipped | Allowed only for `CLAIMS: SKIPPED`; otherwise block as unexpected |

External-source handling uses `EXTERNAL: SKIPPED`, `EXTERNAL: USED`, or
`EXTERNAL: UNAVAILABLE`. Continue local-only when unavailable external content
is optional. Stop at `Blocked: required external dependency unavailable` only
when the missing external source is required to answer a current-contract
question.

## Subagent Registry

Use this registry as a lookup table. Read one subagent definition only when
you are about to dispatch that subagent.

| Subagent | Path | Purpose |
| -------- | ---- | ------- |
| `context-extractor` | `./subagents/context-extractor.md` | Capture original mandate, instruction amendments, and chronological Q&A |
| `insight-documenter` | `./subagents/insight-documenter.md` | Extract evidence-backed findings, risks, and recommendations |
| `claim-validator` | `./subagents/claim-validator.md` | Verify factual claims from tracking files against primary sources |
| `document-assembler` | `./subagents/document-assembler.md` | Assemble the final handoff document from the structured artifacts |
| `handoff-reviewer` | `./subagents/handoff-reviewer.md` | Review the written handoff against quality gates and return targeted rerun guidance |

## Progressive Loading Map

Load the smallest local file that answers the current question. Fetch one
external URL only when conceptual background or current platform documentation
would otherwise bloat the prompt.

| Need | Load | Timing |
| ---- | ---- | ------ |
| Artifact naming, JSON schemas, path/write checks, status vocabulary, final section contract | `./references/data-contracts.md` | Before Stage 1 and when schemas are unclear |
| Final validation gates and targeted rerun routing | `./references/quality-checklist.md` | Loaded by `handoff-reviewer` only |
| Dispatch round-trip example | `./references/dispatch-example.md` | Only when an example would clarify execution |
| Conceptual or current external background | `./references/external-sources.md`, then one relevant URL | Only when local contracts are insufficient |
| Final handoff template | `./references/handoff-template.md` | Loaded only by `document-assembler` at assembly time |

Bundled contracts win over fetched content when they conflict.

## Execution Steps

1. Confirm `TARGET_FILE`; ask only if the path is unclear. Stop with
   `Blocked: unclear target path` until the user answers.
2. Validate readable inputs, writable target location, and sibling artifact
   locations. If any path or write check is unsafe, stop with
   `Blocked: unsafe writes or missing readable/writable path`.
3. Read `./references/data-contracts.md` and derive sibling artifact paths.
4. Decide whether bundled contracts are sufficient. Record
   `EXTERNAL: SKIPPED`, `EXTERNAL: USED`, or `EXTERNAL: UNAVAILABLE`; block only
   with `Blocked: required external dependency unavailable` when a required
   external dependency is unavailable.
5. Dispatch `context-extractor` with `CONTEXT_SOURCE` and `CONTEXT_FILE`.
   Continue on `CONTEXT: PASS` or `CONTEXT: WARN`; block on `CONTEXT: ERROR`,
   `CONTEXT: FAIL`, or unexpected `CONTEXT: SKIPPED`.
6. Dispatch `insight-documenter` with `CONTEXT_SOURCE` and `INSIGHTS_FILE`.
   Continue on `INSIGHTS: PASS` or `INSIGHTS: WARN`; block on
   `INSIGHTS: ERROR`, `INSIGHTS: FAIL`, or unexpected `INSIGHTS: SKIPPED`.
7. If `TRACKING_FILES` exist, dispatch `claim-validator` with
   `TRACKING_FILES`, `INSIGHTS_FILE`, and `CLAIMS_FILE`. Continue on
   `CLAIMS: PASS` or `CLAIMS: WARN`; record `CLAIMS: SKIPPED` only when no
   tracking files were provided or the claim stage explicitly reports an
   intentional skip.
8. Dispatch `document-assembler` with `TARGET_FILE`, `SUBJECT`,
   `CONTEXT_FILE`, `INSIGHTS_FILE`, and optional `CLAIMS_FILE`. Continue on
   `HANDOFF: PASS` or `HANDOFF: WARN`; block on `HANDOFF: ERROR`,
   `HANDOFF: FAIL`, or unexpected `HANDOFF: SKIPPED`.
9. Dispatch `handoff-reviewer` with `TARGET_FILE`, `CONTEXT_FILE`,
   `INSIGHTS_FILE`, and optional `CLAIMS_FILE`. Complete on `REVIEW: PASS` or
   `REVIEW: WARN`; block on `REVIEW: ERROR` or unexpected `REVIEW: SKIPPED`.
10. If the reviewer returns `REVIEW: FAIL`, parse one or many rerun targets,
    normalize them into the canonical order `context-extractor`,
    `insight-documenter`, `claim-validator`, `document-assembler`,
    `handoff-reviewer`, rerun the earliest named upstream stage plus downstream
    consumers, then rerun review.
11. Stop after three repair cycles and report `Blocked: repair limit exhausted`
    if quality gates still fail.
12. Return the final handoff path, sibling artifact paths, external status,
    stage verdicts, review verdict, counts, warnings, and open-question count;
    then mark the run `Completed: review pass`.

## Output Contract

This skill writes resumability artifacts that preserve workflow state for
later continuation; it does not produce product-code changes.

| Artifact | Produced by | Purpose |
| -------- | ----------- | ------- |
| `TARGET_FILE` | `document-assembler` | Final cold-start handoff document |
| `<stem>.context.json` | `context-extractor` | Original instructions, amendments, Q&A log |
| `<stem>.insights.json` | `insight-documenter` | Findings with evidence, category, priority, verification state |
| `<stem>.claims.json` | `claim-validator` | Optional claim-validation checklist and summary |

`TARGET_FILE` must follow the five-section contract in
`./references/data-contracts.md`.

## Dispatch Contract

For any subagent dispatch:

1. Read the subagent definition from the registry.
2. Pass only the explicit inputs that subagent needs.
3. Collect its structured summary.
4. Retain only the verdict, file path, next-step-relevant counts, warnings, and
   rerun targets.
5. Route the returned status through the Status Vocabulary before proceeding.

Treat tracking-file claims as provisional even after validation; the final
handoff keeps that caution visible for the next agent.

## Example

A complete dispatch round trip with sample subagent summaries lives in
`./references/dispatch-example.md`. Read it only when an example would clarify
dispatch order, expected summaries, warning handling, rerun handling, or the
final response shape.
