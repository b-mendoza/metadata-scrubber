# Data Contracts - Artifact Validation Quick Reference

> Read this when you need to know exactly what to pass to `artifact-validator` at a phase boundary, or what a verdict means for the next decision. Validation stays delegated; this file is the compact contract reference, not a substitute for the phase playbooks. For platform-specific field names, endpoint syntax, or capability questions, fetch one URL via the active playbook's External-Source Routing section.

The validator's structured verdict is the orchestration decision input. Do not replace it with ad hoc raw-file checks at the orchestrator level.

`<KEY>` below is the workflow key value passed under the parameter name `TICKET_KEY`; the active playbook defines its shape.

## Phase 1 Snapshot Conventions

These conventions govern how `artifact-validator` interprets Phase 1 fetch artifacts across both platforms:

- **Timestamp normalization.** Timestamps that carry a time are normalized to `YYYY-MM-DD HH:MM UTC`; date-only values are preserved as `YYYY-MM-DD`.
- **`_Unknown. <reason>_` vs. `_None_`.** A `_Unknown_` marker means the retriever could not verify presence or absence of the item; `_None_` means absence was verified. They are not interchangeable.
- **`FETCH: PARTIAL` with `Validation: PASS` is a success.** The parent snapshot is valid, but some related items or comments could not be retrieved and are recorded under `## Retrieval Warnings`.

---

## Validation by Phase Transition

Each row shows what to dispatch to `artifact-validator` and what to expect.

### Phases 1-4

For Phase 1, the gate below mirrors the stable snapshot contract owned by the playbook's Phase 1 downstream skill. Treat that downstream skill as the authoritative definition of `docs/<KEY>.md`. The active playbook's `Phase 1 Snapshot Sections` section lists the per-platform heading order.

For Phase 2, the summary section heading is also playbook-owned. The active playbook's `Phase 2 Task Plan Summary Heading` section supplies the exact heading that appears before `## Execution Order Summary`.

For Phase 4 and the Phase 5 precondition, use the stronger handoff contract owned by the playbook's Phase 4 downstream skill. The active playbook's `Phase 4 Child-Item Table and Write Model` section defines the table name, required handoff metadata, inline reference label, and accepted value forms.

| Phase | Direction | File to check | Expected checks |
| --- | --- | --- | --- |
| 1 | postcondition | `docs/<KEY>.md` | File exists and preserves the playbook's Phase 1 snapshot heading order (stable when empty) |
| 2 | precondition | `docs/<KEY>.md` | Same as Phase 1 postcondition |
| 2 | postcondition | `docs/<KEY>-tasks.md` + planning intermediates | `docs/<KEY>-stage-1-detailed.md` and `docs/<KEY>-stage-2-prioritized.md` exist; `docs/<KEY>-tasks.md` exists; final plan preserves this section order: active playbook's Phase 2 task plan summary heading (`## Ticket Summary` for Jira, `## Issue Summary` for GitHub), `## Execution Order Summary`, `## Problem Framing`, `## Assumptions and Constraints`, `## Cross-Cutting Open Questions`, `## Tasks`, numbered `## Task N: <Title>` sections, `## Notes`, `## Dependency Graph`, `## Validation Report`; plan has ≥2 numbered task entries with the required task subsections unless the planning skill records its internal current-child-item exception for a smaller execution plan; branch names are present and satisfy the deterministic branch contract owned by the planning skill |
| 3 | precondition | `docs/<KEY>-tasks.md` + planning intermediates | Same as Phase 2 postcondition |
| 3 | postcondition | `docs/<KEY>-upfront-critique.md` + `docs/<KEY>-tasks.md` | `docs/<KEY>-upfront-critique.md` exists; `docs/<KEY>-tasks.md` contains `## Decisions Log` |
| 4 | precondition | `docs/<KEY>-upfront-critique.md` + `docs/<KEY>-tasks.md` | Same as Phase 3 postcondition |
| 4 | postcondition | `docs/<KEY>-tasks.md` | Contains the playbook's workflow-level child-item table heading, any playbook-required handoff metadata, and one row per numbered task; every numbered task section contains exactly one inline child-item reference whose value matches that task's table row (concrete identifier, `Not Created`, or playbook-defined degraded value) |
| 5 | precondition | `docs/<KEY>-tasks.md` | Same as Phase 4 postcondition, and the selected task's inline child-item value is a concrete identifier or an accepted playbook-defined degraded value. `Not Created` requires manual resolution or a successful Phase 4 rerun before Phase 5 planning. |

The validator must use the active playbook's summary heading for the first Phase 2 section. Do not require a neutral `## Work Item Summary` heading in the generated task plan unless a future playbook explicitly declares it.

### Phases 5-7 (per task)

The orchestrator boundary here is the presence of the full four-file planning handoff. Detailed section requirements inside those files are owned by the downstream planning skill.

| Phase | Direction | File to check | Expected checks |
| --- | --- | --- | --- |
| 5 | postcondition | `docs/<KEY>-task-<N>-brief.md` + `-execution-plan.md` + `-test-spec.md` + `-refactoring-plan.md` | All 4 Phase 5 planning artifacts exist |
| 6 | precondition | Same four files as Phase 5 postcondition | Same as Phase 5 postcondition |
| 6 | postcondition | `docs/<KEY>-task-<N>-critique.md` + `-decisions.md` | Both critique and decisions artifacts exist |
| 7 | precondition | Standard Phase 1-6 execution handoff | `docs/<KEY>.md`, `docs/<KEY>-tasks.md`, and all four Phase 5 + two Phase 6 task artifacts exist (6 → 7 readiness) |

For Phase 7, this table defines the orchestrator's normal workflow-gate check. Execution-skill-internal optional inputs do not change this validator contract.

---

## Dispatch Format

Every dispatch to `artifact-validator` uses these inputs:

```text
TICKET_KEY: <KEY>                 (workflow key; shape defined by the active playbook)
PLAYBOOK_PATH: ./references/<platform>-playbook.md
                                   (package-root-relative active playbook; pass for every validator dispatch)
PHASE: <1-7>
DIRECTION: <precondition | postcondition>
TASK_NUMBER: <N>                  (task-specific boundaries only)
```

The subagent returns a structured verdict:

```text
VALIDATION: <PASS | FAIL | ERROR>
Phase: <N> | Direction: <precondition | postcondition>
File: <path>
Checks:
  - File exists: <yes/no>
  - <Section check>: <pass/fail - detail if failed>
```

If the validator itself cannot complete, it returns:

```text
VALIDATION: ERROR
Phase: <N> | Direction: <precondition | postcondition>
Reason: <what prevented validation>
```

For Phases 3 and 6, validation covers only the artifact boundary. The clarification skill's final summary still carries `RE_PLAN_NEEDED` and `BLOCKERS_PRESENT`, and the orchestrator must honor those flags separately at the gate step.

### Phase 1 Fetch Summary (12-line contract)

The Phase 1 downstream skill returns this locked 12-line summary. The active playbook's `Phase 1 Fetch Summary Fields` section supplies the identifier-bearing lines (lines 5-9 vary per platform). Branch on the structured fields, not on a single status line.

```text
FETCH: <PASS | PARTIAL | FAIL | ERROR>
Validation: <PASS | FAIL | NOT_RUN>
Failure category: <NONE | BAD_INPUT | NOT_FOUND | AUTH | TOOLS_MISSING | RATE_LIMIT | UNEXPECTED>
File written: docs/<KEY>.md | None
<playbook-supplied identifier line: e.g. "Ticket: <KEY>: <Summary>" / "Issue: <owner>/<repo>#<N>: <Title>">
<playbook-supplied status/state line: e.g. "Status: <s> | Type: <t>" / "State: <OPEN|CLOSED>">
Comments: <retrieved>/<found | N/A>
<playbook-supplied children line: e.g. "Subtasks: ..." / "Child issues: ...">
Linked issues: <retrieved>/<found | UNKNOWN | N/A>
Attachments: <N | N/A>
Warnings: <None | semicolon-separated warnings>
Reason: <None | fatal reason>
```

Interpret it as:

| Pair | Meaning | Action |
| --- | --- | --- |
| `PASS` + `PASS` | Success | Run Phase 1 postcondition validator |
| `PARTIAL` + `PASS` | Success with warnings | Preserve `## Retrieval Warnings`; run postcondition validator |
| `FAIL` + `NOT_RUN` | Retrieval failed before write | Skip postcondition; route on `Failure category` per `./error-handling.md` |
| `Validation: FAIL` | Contract failure | Stop and surface, regardless of `FETCH` |
| `FETCH: ERROR` | Unexpected failure | Stop and surface, regardless of `Validation` |
| Any inconsistent pair (e.g. `PASS` + `NOT_RUN`) | Treat as unexpected Phase 1 error | Stop |

Branch on `Failure category` when present. Use `Reason` only for user-facing detail.

### Progress Tracker Dispatch (summary)

When dispatching `progress-tracker`, read its subagent definition from the registry. Typical orchestrator inputs:

```text
TICKET_KEY: <KEY>
ACTION: read | initialize | update | initialize_task | update_task
```

Include `PLAYBOOK_PATH=./references/<platform>-playbook.md` only for actions that read progress templates or phase skill names: `initialize`, `update`, and `initialize_task`.

- `update`: `PHASE` (1-4), `STATUS`, `SUMMARY`; for `PHASE=4` and `STATUS=complete`, include `TASKS` (metadata for the workflow task table, from the Phase 4 downstream summary).
- `initialize_task`: `TASK_NUMBER`, `TASK_TITLE`.
- `update_task`: `TASK_NUMBER`, `PHASE` (5-7), `STATUS`, `SUMMARY`.

---

## Handling Verdicts

**On PASS:** proceed to the next step in the execution cycle. Do not narrate the validation result unless the user asks.

**On FAIL:** do not proceed.

| Direction | On FAIL |
| --- | --- |
| Precondition | A required artifact is missing. Tell the user which phase produced it and offer to run that phase. |
| Postcondition | The phase did not produce its expected artifact. Report the specific check that failed and offer to re-run the phase. |

<example>
Postcondition failure after Phase 2:

artifact-validator returns: VALIDATION: FAIL Phase: 2 | Direction: postcondition File: docs/<KEY>-tasks.md + planning intermediates Checks:

- docs/<KEY>-tasks.md exists: pass
- Contains ## Validation Report: fail - missing section

Orchestrator to user: "Phase 2 (Plan Tasks) is missing `## Validation Report`, so Phase 3 would be working from an incomplete artifact. Re-run Phase 2?" </example>

---

## Artifact Categories

- **Category A** (orchestration artifacts, `docs/<KEY>*.md`): updated on disk only, preserved across sessions, never committed.
- **Category B** (implementation output): source code, tests, config changes — committed normally by the downstream execution skill.
