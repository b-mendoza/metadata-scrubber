# Task Planning Guide

Read this file when `task-planner` converts a work-item snapshot into the Stage 1 detailed plan. The active playbook (`PLAYBOOK_PATH`) supplies every platform-specific detail, including exact nouns, required snapshot headings, child-coverage source, current-item detection, and required rendered wording.

> Apply the local operational rules first. External sources are optional background and never override the snapshot, playbook, or output contract.

## Optional Source Lookups

| Need | Source key in `EXTERNAL_SOURCES_PATH` |
| --- | --- |
| Underlying-need analysis | `five-whys` |
| Traceability expectations | `requirements-traceability` |
| Concrete completion criteria | `definition-of-done` |
| Task-quality sanity check | `invest-criteria` |
| Avoiding speculative scope | `yagni` |
| Platform parent / child hierarchy behavior | Active playbook's `External-Source Routing` key |

## Problem Framing

Capture the problem the work item is trying to solve, not only the prescribed solution. Mark inferred content as inference; gaps become Phase 3 critique fuel. Render the active playbook's work-item noun in the artifact.

Required subsections:

| Subsection | What to capture |
| --- | --- |
| `### End User` | Who directly experiences the outcome |
| `### Underlying Need` | The problem in user terms |
| `### Proposed Solution` | What the work item asks to build or change |
| `### Solution-Problem Fit` | How directly the solution addresses the need |
| `### Alternative Approaches Not Explored` | Plausible options not discussed |
| `### Evidence Basis` | Evidence cited for why the solution is correct |

Use the template's playbook-rendered `Not stated in <work-item noun>` wording when the snapshot does not answer a subsection.

## Decomposition

Split work into self-contained units with one clear objective, one likely owner, and a verifiable definition of done. Useful categories when relevant: requirements, infrastructure, data changes, core logic, integration, UI/UX, testing, documentation, and cleanup.

Target 4-15 tasks. When the work item justifies fewer or more, keep the plan accurate and explain the exception in `## Notes`.

The current-item mode has one internal exception: one execution task is allowed when further splitting would invent child items of the current child item rather than clarify execution. Record that reasoning in `## Notes`; it is a workflow rule, not a platform capability claim.

## Existing Child Work and Linked Issues

Read child work only from the active playbook's child-work section. Map each concrete child item to a task, explain consolidation, or mark it explicitly out of scope. Do not treat Jira subtasks as GitHub child issues or vice versa.

Use `## Linked Issues` for dependency and context. Reflect hard blocking or ordering only when the authoritative snapshot makes it clear.

## Current-Item Detection

Apply the active playbook's exact detection rule. When active:

- record the mode in `## Assumptions and Constraints`;
- insert the playbook's exact platform-specific note under `## Notes`;
- keep the plan execution-oriented; and
- avoid child-of-child planning.

Stage 2 converts that note into one repeated branch and the playbook's exact execution-summary sentence.

## Per-Task Detail

Every lettered Stage 1 task contains:

- `**Objective:**`
- `**Relevant requirements and context:**`
- `**Questions to answer before starting:**`
- `**Implementation notes:**`
- `**Definition of done:**`
- `**Likely files / artifacts affected:**`
- a `Traces to` reference using the active platform's child-item noun when applicable

Use `Task A`, `Task B`, `Task C`, and so on. Stage 2 assigns final numbers, dependencies, priorities, and branches.

## Quality Self-Check

Before writing:

- `## Problem Framing` has all six subsections.
- Inference is marked explicitly.
- Every description requirement has a task or explicit deferral in `## Notes`.
- Every acceptance criterion maps to at least one definition-of-done item.
- Every task has all required fields and a traceability reference.
- Concrete child work from the playbook's section is accounted for.
- Cross-cutting and per-task questions are not duplicated.
- Task count is appropriate, with exceptions explained.
- Current-item mode uses the playbook's exact note wording.

## Common Mistakes

- Merging UI and backend work solely because they serve one feature.
- Ignoring comments that add scope, decisions, or clarifications.
- Creating a vague miscellaneous task.
- Copying the full snapshot into implementation notes.
- Writing vague done criteria such as `works correctly`.
- Assuming shared context across tasks instead of repeating task-local detail.
- Rendering neutral or wrong-platform nouns in the final artifact.
