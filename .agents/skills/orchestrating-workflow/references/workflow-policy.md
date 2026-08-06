# Workflow Policy

> Read this when starting or resuming the workflow, checking a gate, or deciding how to route a blocker. Stay at summary level: dispatch helpers for raw checks and retain only compact verdicts. For background on why this policy exists (context engineering, progressive disclosure), fetch the relevant URL from `./external-sources.md` only if a design decision depends on it.

This file holds the operating policy that applies across phases. The phase-specific playbooks remain in `./phases-1-4.md` and `./task-loop.md`, and the artifact validation contracts in `./data-contracts.md`. Per-platform contracts (identifier shape, transport, downstream skill names, snapshot sections, write model, status-check syntax, external URLs) live in `./jira-playbook.md` or `./github-playbook.md`.

## Context Boundaries

The orchestrator holds only:

- Decision-relevant summaries from subagents and downstream skills
- Current workflow state: phase, task number, status, next gate
- User instructions and confirmations
- Failure reports that require judgment

Use structured handoffs: the workflow key passed under the parameter name `TICKET_KEY` (value shape defined by the active playbook), file paths, task numbers, and short summaries. Validation, platform queries via the playbook-supplied transport, file updates, git inspection, code search, and documentation lookup are delegated.

## Standard Phase Cycle

Phases 1-6 use this cycle:

1. Announce the phase banner.
2. Validate preconditions by dispatching `artifact-validator` when the phase has a precondition.
3. Invoke the downstream skill by name through the host runtime. The active playbook's Phase Skill Map names the skill for the current phase. Load `./downstream-skills.md` first only when the phase-to-skill contract is needed.
4. Validate postconditions by dispatching `artifact-validator`.
5. Update progress by dispatching `progress-tracker`.
6. Run the gate check: advance automatically, ask the user, or enter a targeted re-plan / retry loop.

Phase 7 uses the same precondition → downstream skill → progress → gate shape, but the playbook's Phase 7 execution skill owns internal kickoff, implementation, quality gates, and targeted fix cycles. The orchestrator does not add a Phase 7 postcondition validator.

Use this banner format:

```text
----------------------------------------
Phase <N>/7 - <Phase name>
----------------------------------------
```

When a phase has a targeted fix or re-plan loop, re-run only the failing phase and failing gate. Maximum: 3 loops before escalating to the user.

## Gate Rules

| Boundary | Gate type | Rule |
| --- | --- | --- |
| 1 → 2 | Automatic | Proceed when validation passes |
| 2 → 3 | Automatic | Proceed when validation passes |
| 3 → 4 | User gate | Proceed only when validation passes, `BLOCKERS_PRESENT=false`, and the user explicitly approves platform writes |
| 4 → 5 | User gate | User selects the next task to execute |
| 5 → 6 | Automatic | Proceed when planning artifacts validate |
| 6 → 7 | User gate | Proceed only when validation passes, `BLOCKERS_PRESENT=false`, and the user confirms the critiqued task plan is ready for real execution |
| 7 → next task | User gate | User chooses the next task or stops |

For Phases 3 and 6, gate decisions use both the validator verdict and the `clarifying-assumptions` final summary. `BLOCKERS_PRESENT=true` is a hard stop. `RE_PLAN_NEEDED=true` reopens the relevant planning phase before the gate can advance.

## Resume Mapping

After dispatching `progress-tracker` with the workflow key and `ACTION=read`, choose a resume point from this table, then dispatch `preflight-checker` with the workflow key, `PLAYBOOK_PATH=<active playbook path>`, and only the remaining phase range.

| Progress indicates | Resume from | Preflight `PHASES` |
| --- | --- | --- |
| No artifacts found | Phase 1 | `1-7` |
| Phase 1 complete, Phase 2 not started | Phase 2 | `2-7` |
| Phases 1-2 complete, Phase 3 not done | Phase 3 | `3-7` |
| Phases 1-3 complete, Phase 4 not done | Phase 4 | `4-7` |
| Phases 1-4 complete, no tasks started | Phase 5 (task selection) | `5-7` |
| Task N at Phase 5 complete, Phase 6 not done | Phase 6, Task N | `6-7` |
| Task N at Phase 6 complete, Phase 7 not done | Phase 7, Task N | `7` |
| Task N complete, other tasks remaining | Phase 5 (task selection) | `5-7` |

Confirm with the user before resuming past Phase 1, then load the matching playbook (`./phases-1-4.md` for Phases 1-4, `./task-loop.md` for Phases 5-7).

## Clarification Flags

Treat `RE_PLAN_NEEDED` and `BLOCKERS_PRESENT` as phase-boundary inputs even though they are not validator artifacts.

- `RE_PLAN_NEEDED=true` in Phase 3: re-run Phase 2 with accepted decisions, then re-run Phase 2 postcondition and Phase 3.
- `RE_PLAN_NEEDED=true` in Phase 6: if the critique iteration is below 3, re-run Phase 5 with the task decisions file, increment the critique iteration, then re-run Phase 6. If the critique iteration is already 3, stop and surface the unresolved critique items.
- `BLOCKERS_PRESENT=true`: stop before platform writes or task execution. Surface the unresolved blockers and resume only after the user resolves or accepts them.

## Phase 7 Ownership

Once the normal Phase 5 + Phase 6 handoff validates, the playbook's Phase 7 execution skill owns the execution-side readiness contract. It decides which kickoff artifacts are required, whether platform state should be updated, and how quality-gate fix cycles run.

If the execution skill returns `BLOCKED` from kickoff, task execution, documentation, requirements verification, or a quality reviewer, treat it as a resume point. Record the task as stopped at Phase 7, surface the blocker, and resume from that Phase 7 step after the blocker is resolved.

## Escalation Summary

Load `./error-handling.md` for detailed recovery routing when any of these conditions occurs:

- `PREFLIGHT: FAIL` or `PREFLIGHT: ERROR`
- Critical validator or progress failures
- Platform transport unavailable for a transport-dependent phase (the playbook names the specific transport in its Transport section)
- Phase 1 fetch failure or inconsistent fetch / validation summary
- Phase 7 `BLOCKED`, downstream `ERROR`, or exhausted execution fix cycle
- Retry or re-plan loop exhausted

## Examples

<example>
Resume scenario (Jira platform detected, `./jira-playbook.md` loaded):

`progress-tracker` returns: `Phases: 1 complete | 2 complete | 3 complete | 4 complete; Tasks: 1/3 complete | Task 2: Phase 5 active; Resume from: Phase 5, Task 2`.

Orchestrator response: `Found existing progress for JNS-6065. Phases 1-4 are complete and Task 2 was in planning. Shall I resume from Phase 5 for Task 2?` </example>

<example>
Phase 7 kickoff blocker (GitHub platform detected, `./github-playbook.md`
loaded):

The Phase 7 execution skill reports `BLOCKED` because unrelated local changes make workspace mutation unsafe. Record Phase 7 as failed/blocked in task progress, present the blocker summary, and resume from Phase 7 after the user resolves the workspace state. </example>
