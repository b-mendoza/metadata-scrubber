# Phases 1-4 - Linear Pipeline

> Read this file when entering Phase 1, 2, 3, or 4. For exact artifact checks, load `./data-contracts.md` and dispatch `artifact-validator`; do not inspect artifacts inline in the orchestrator. For platform-specific field, endpoint, capability, or setup questions, fetch one URL from the active playbook's External-Source Routing section via `./external-sources.md`. Load `./downstream-skills.md` only when you need the phase-to-skill dependency map or dispatch contract details.

The active playbook's Phase Skill Map names the runtime skill for each phase. After Phase 4 completes and the user selects a task, read `./task-loop.md`.

For every phase, use the standard cycle from `./workflow-policy.md`: announce, validate preconditions when present, invoke the downstream skill, validate postconditions, update progress, and run the gate.

`<KEY>` below is the workflow key value passed under the parameter name `TICKET_KEY`; the active playbook defines its shape.

## Phase 1 - Fetch Work Item

**Skill:** Named in the active playbook's Phase Skill Map row for Phase 1.

1. Announce Phase 1.
2. Invoke the downstream skill with the inputs named in the playbook's Phase Skill Map row for Phase 1.
3. Interpret the downstream 12-line fetch summary using `./data-contracts.md`. The playbook supplies the platform-specific field labels for the identifier-bearing lines.
4. If retrieval failed before writing an artifact, route through `./error-handling.md` instead of running postcondition validation.
5. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=1`, `DIRECTION=postcondition`. The validator loads the playbook for the platform-specific snapshot section list.
6. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `ACTION=update`, `PHASE=1`, `STATUS=complete`, and a one-line fetch summary.

**Gate:** Automatic. Proceed to Phase 2 when validation passes.

## Phase 2 - Plan Tasks

**Skill:** Named in the active playbook's Phase Skill Map row for Phase 2.

1. Announce Phase 2.
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=2`, `DIRECTION=precondition`.
3. Invoke the downstream skill with the inputs named in the playbook's Phase Skill Map row for Phase 2.
4. When re-planning from Phase 3, also pass `RE_PLAN=true` and the accepted `DECISIONS` summary from critique.
5. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=2`, `DIRECTION=postcondition`.
6. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `ACTION=update`, `PHASE=2`, `STATUS=complete`, and a one-line planning summary.

**Gate:** Automatic. Proceed to Phase 3 when validation passes.

## Phase 3 - Clarify Assumptions + Critique Plan

**Skill:** `clarifying-assumptions` **Mode:** `upfront`

1. Announce Phase 3.
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=3`, `DIRECTION=precondition`.
3. Invoke `clarifying-assumptions` with `MODE=upfront`, `TICKET_KEY=<KEY>`, and `ITERATION=<N>`. (`clarifying-assumptions` accepts `TICKET_KEY` as the workflow-key alias for either platform's identifier.)
4. Let the downstream skill handle user-facing clarification and critique.
5. If the downstream summary has `RE_PLAN_NEEDED=true`, re-run Phase 2 with the accepted decisions, then run Phase 3 again. Maximum: 3 re-plan loops.
6. After `RE_PLAN_NEEDED=false`, dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=3`, `DIRECTION=postcondition`.
7. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `ACTION=update`, `PHASE=3`, `STATUS=complete`, and a one-line clarification summary.

**Gate:** First honor `BLOCKERS_PRESENT` from the clarification summary. If it is `true`, stop before platform writes and surface the unresolved blockers.

If blockers are clear, ask the user the active playbook's `Phase 3 Approval Prompt` block verbatim.

Proceed to Phase 4 only when the user explicitly chooses the first option (the playbook's "create child items now" option).

## Phase 4 - Create Child Items

**Skill:** Named in the active playbook's Phase Skill Map row for Phase 4.

Write-model rules differ by platform; see the active playbook's `Phase 4 Child-Item Table and Write Model` section before invoking the downstream skill.

1. Announce Phase 4.
2. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=4`, `DIRECTION=precondition`.
3. Confirm the playbook's required Phase 4 inputs (named in its `Inputs and Identifier` section) are available. If missing, stop and ask the user for the canonical work-item URL before platform writes.
4. Invoke the downstream skill with the inputs named in the playbook's Phase Skill Map row for Phase 4.
5. Retain only the structured `Created/Linked` summary the playbook's write-model section defines, plus warnings and failed-create notes.
6. Dispatch `artifact-validator` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `PHASE=4`, `DIRECTION=postcondition`.
7. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY`, `PLAYBOOK_PATH=<active playbook path>`, `ACTION=update`, `PHASE=4`, `STATUS=complete`, `SUMMARY=<one-line result>`, and `TASKS=<rows from the downstream child-item table>`.
8. Surface any warnings or failed creates before task selection.
9. Do not offer a task for Phase 5 when its inline child-item value is `Not Created`; require manual resolution or a successful Phase 4 rerun for that task first. If the playbook recognizes a degraded value, surface the degraded traceability and proceed only when the user accepts that model for the selected task.

**Gate:** User chooses which task to execute next. Never auto-start a task.

<example>
Child items created. Which task would you like to work on first?

| #   | Title                    | Dependencies | Priority |
| --- | ------------------------ | ------------ | -------- |
| 1   | Add input validation     | None         | High     |
| 2   | Implement caching layer  | Task 1       | High     |
| 3   | Update API documentation | None         | Medium   |

Pick a task number, or say `show me the full plan` for more detail. </example>
