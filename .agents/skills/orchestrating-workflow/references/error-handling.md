# Error Handling and Resumability

> Read this when something goes wrong, or when resuming a previously interrupted workflow. Stay at summary level: record the failure state, present the decision, re-dispatch the relevant skill or subagent. For platform-specific setup (auth, install, scope troubleshooting), fetch the matching URL via the active playbook's External-Source Routing section instead of inlining setup prose here.

`<KEY>` below is the workflow key value passed under the parameter name `TICKET_KEY`; the active playbook defines its shape.

---

## Error Routing Table

The guiding principle: surface failures immediately and let progress files handle recovery.

| Error | Response | Where to look |
| --- | --- | --- |
| **Skill failure** | `progress-tracker` with `STATUS=failed` (`update` for Phases 1-4, `update_task` for Phases 5-7). Offer retry or abort. Offer skip only when no later phase depends on the failed step. | Downstream skill output |
| **Missing artifact** | `artifact-validator` reports FAIL → do not proceed. Tell the user which phase produces it and offer to re-run that phase. | `./data-contracts.md` |
| **Platform transport unavailable** | Pause the workflow (do not fail). Tell the user what the active playbook's `Transport` section identifies as the failure mode and how to restore it, then offer to resume. | Active playbook's `Transport` and `External-Source Routing` |
| **Phase 1 fetch failure** | See [Phase 1 Failure Routing](#phase-1-failure-routing) | `./data-contracts.md` |
| **Subagent failure (non-critical)** | Proceed without the result — utility subagents are advisory. | This file → critical/non-critical table |
| **Subagent failure (critical)** | Halt the phase. Critical subagents produce results required for the next step. | This file → critical/non-critical table |
| **User interruption** | Progress files ensure resumability. Tell the user: "Say `resume <KEY>` (or provide the work-item URL) to continue." | `./workflow-policy.md` → Resume Mapping |
| **Quality gate failure** | Owned by the playbook's Phase 7 execution skill via internal fix cycles. Escalate only after 3 attempts. | Downstream skill output |
| **Execution kickoff blocker** | Stop before implementation and surface the blocker (workspace, branch, platform state). | Downstream skill output |
| **Phase 7 capability blocker** | Required tool, runtime, permission, or credential is unavailable. Stop the task and present as a steering decision; do not silently skip. | Downstream skill output |
| **Task-executor ambiguity** | Resolve with the user, update the brief, re-dispatch. Max 3 retry cycles. | Downstream skill output |
| **Re-plan cycle exhausted** | After 3 re-plan iterations (Phase 3→2 or Phase 6→5), present accumulated critique to the user. | `./workflow-policy.md` → Clarification Flags |

### Critical vs Non-critical Subagents

| Critical (halt on failure)        | Non-critical (proceed without)      |
| --------------------------------- | ----------------------------------- |
| `artifact-validator`              | `documentation-finder`              |
| `progress-tracker`                | `code-reference-finder`             |
| `preflight-checker`               | `codebase-inspector`                |
| `status-checker` (Phase 1/4 only) | `status-checker` (pre-task context) |

The same subagent can be critical or non-critical depending on context. When dispatched as part of the phase execution cycle (preconditions or postconditions), `artifact-validator` is always critical. When `status-checker` is dispatched for pre-task context gathering, it is non-critical — the task can proceed without fresh platform status.

---

## Phase 1 Failure Routing

`FETCH: FAIL` with `Validation: NOT_RUN` means retrieval failed before the artifact was written. Do not run the Phase 1 postcondition validator. Branch on `Failure category`; per-platform recovery details live in the active playbook's `Transport` and `External-Source Routing` sections.

| Failure category | Response |
| --- | --- |
| `BAD_INPUT` | Malformed URL or coordinates — ask the user for a valid work-item URL (the playbook names the expected URL form). |
| `NOT_FOUND` | Parent work item missing or inaccessible — confirm the identifier and platform credentials/scope. |
| `AUTH` | Tell the user to restore platform authentication. The active playbook's `Transport` section names the specific action; its `External-Source Routing` section points to the setup help. |
| `TOOLS_MISSING` | The platform transport is not available. The playbook's `Transport` and `External-Source Routing` sections name the setup steps. |
| `RATE_LIMIT` | Retry budget exhausted — pause and resume later. |
| `UNEXPECTED` | Surface the reason and ask whether to retry. |

`FETCH: PARTIAL` with `Validation: PASS` is **success**, not failure — the parent snapshot is valid but some related items could not be retrieved. Preserve `## Retrieval Warnings` and proceed to the postcondition validator.

`Validation: FAIL`, `FETCH: ERROR`, or any inconsistent pair (e.g. `FETCH: PASS` with `Validation: NOT_RUN`) is a hard stop. Surface the structured summary and do not run the postcondition validator unless the pair is `PASS / PASS` or `PARTIAL / PASS`.

---

## Resumability

Two levels of progress files maintain state:

- `docs/<KEY>-progress.md` — workflow-level (Phases 1-4 + task summary table)
- `docs/<KEY>-task-<N>-progress.md` — per-task (Phases 5-7)

### Resume procedure

1. Dispatch `progress-tracker` with the workflow key under `TICKET_KEY` and `ACTION=read`:

   ```yaml
   TICKET_KEY: <KEY>
   ACTION: read
   ```

2. Use the resume mapping in `./workflow-policy.md` to choose the start point and `preflight-checker` `PHASES` range.
3. Inform and confirm with the user before resuming past Phase 1.
4. Load the matching playbook (`./phases-1-4.md` or `./task-loop.md`).

<example>
`progress-tracker` returns:
"Phases: 1 ✅ | 2 ✅ | 3 ✅ | 4 ✅
Tasks: 1/3 complete | Task 2: Phase 5 (Plan) 🔄
Resume from: Phase 5, Task 2"

Orchestrator to user (Jira): "Found existing progress for JNS-6065. Phases 1-4 are complete (3 tasks planned). Task 1 is done. Task 2 was in progress at Phase 5 (planning). Shall I resume from Phase 5 for Task 2?" </example>
