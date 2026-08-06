# Contracts and Preconditions

> Load for readiness validation, mutation-scope derivation, dispatch handoffs, artifact lifecycle, and final report interpretation. The active playbook owns all platform-specific nouns, headings, references, actions, and transport.

`<KEY>` is the value passed under the established `TICKET_KEY` workflow-key alias. Its Jira ticket-key or GitHub issue-slug shape comes from the active playbook.

## Required Input Shape

| Input           | Required | Example                          |
| --------------- | -------- | -------------------------------- |
| `TICKET_KEY`    | Yes      | `JNS-6065` or `acme-app-42`      |
| `TASK_NUMBER`   | Yes      | `3`                              |
| `PLAYBOOK_PATH` | Yes      | `../references/jira-playbook.md` |

The orchestrator derives every standard artifact path from `<KEY>` and `TASK_NUMBER`. Exactly one task is executable in this run.

## Required Artifacts

| Path pattern | Why it matters |
| --- | --- |
| `docs/<KEY>.md` | Phase 1 work-item snapshot and platform context |
| `docs/<KEY>-tasks.md` | Task source of truth, playbook-defined child tracking, and planner-generated branches |
| `docs/<KEY>-task-<N>-brief.md` | Scope, context, constraints, and Definition of Done |
| `docs/<KEY>-task-<N>-execution-plan.md` | Approved implementation approach |
| `docs/<KEY>-task-<N>-test-spec.md` | Required behavior coverage |
| `docs/<KEY>-task-<N>-refactoring-plan.md` | Approved preparation and cleanup |
| `docs/<KEY>-task-<N>-critique.md` | Task-level critique record |
| `docs/<KEY>-task-<N>-decisions.md` | Confirmed post-critique decisions |

If any required artifact is missing, stop before subagent dispatch and name the upstream phase or skill that must run first.

## Task Readiness Checklist

Confirm every item before kickoff:

1. `docs/<KEY>-tasks.md` contains the selected `## Task <N>:` section.
2. The task is not already complete unless the user explicitly requested a re-run.
3. Every prerequisite task named in the plan is complete.
4. The task section and all per-task artifacts align. Material conflicts block kickoff.
5. Questions are resolved, explicitly waived, or recorded as conscious follow-ups.
6. `decisions.md` is authoritative when it changes or clarifies earlier plan wording.
7. Resolve the playbook-defined child-item reference using the active playbook's `Task Plan Tracking Contract`. Missing or degraded linkage does not block local implementation; it limits tracker actions.
8. Resolve the planner branch from the task section's `**Branch name:**` first, then the matching `## Execution Order Summary` row. Missing or conflicting names block kickoff. Apply the active playbook's current-item mode when it exists.
9. Assess tracker capability and record whether each planned startup/completion mutation is optional or mandatory. Optional unavailable actions are skips; mandatory unavailable actions block at the point they are required.
10. Confirm explicit critique approval before crossing the execution mutation boundary.

## Mutation Limits Contract

Derive `MUTATION_LIMITS` once and pass it unchanged to every subagent. It must include:

- Category A allow-list: `docs/<KEY>*.md`, updated only for workflow tracking, kept unstaged and outside git history.
- Category B allow-list: implementation, test, config, in-code documentation, and standalone documentation required by the selected task, with paths justified by the brief, plan, decisions, or current fix brief.
- Tracker allow-list: only the active playbook's startup or final completion actions that approved artifacts or explicit policy authorize.
- Categorical exclusions: unrelated tasks, unrelated implementation files, unrelated tracker records, staging Category A artifacts, deleting workflow artifacts, mutating git history, and starting another task.
- Repair scope: the intersection of the original limits and current verifier or reviewer findings.

Capture a pre-mutation working-tree summary. On terminal output, compare the changed path set with the planned Category A/B scope. Pre-existing unrelated changes remain user-owned and must not be overwritten or included in the task report as this run's work.

## Execution Kickoff Boundary

Kickoff is the first execution mutation boundary after critique approval. It may enter the planner-generated branch and apply playbook-defined startup state. It must be idempotent on resume. Before kickoff, do not perform tracker actions whose purpose is to signal active implementation.

Tracker unavailability is not an unconditional precondition. Record a skip and continue when the action is optional and the workspace is safe; block only when the exact action is mandatory.

## Dispatch Contracts

Every dispatch includes:

```text
TICKET_KEY: <KEY>
TASK_NUMBER: <N>
PLAYBOOK_PATH: ../references/<platform>-playbook.md
MUTATION_LIMITS: <run authority envelope>
```

Reference paths are relative to the consuming subagent file.

| Subagent | Required task inputs | Required reference paths |
| --- | --- | --- |
| `execution-starter` | Snapshot path, task plan path, execution brief path, optional context summaries | `CONTRACTS_PATH`, `KICKOFF_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `task-executor` | Brief, execution plan, test spec, refactoring plan, decisions; optional critique, fix brief, previous execution report | `EXECUTION_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `documentation-writer` | Mode, `EXECUTION_REPORT`, brief path, task plan path; previous documentation and all gate reports for finalization | `DOCUMENTATION_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `requirements-verifier` | Brief path, test spec path, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT` | `REQUIREMENTS_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `clean-code-reviewer` | Brief, test spec, refactoring plan, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT`, `VERIFICATION_RESULT` | `REVIEW_POLICY_PATH`, `REVIEW_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `architecture-reviewer` | Brief, execution plan, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT`, `VERIFICATION_RESULT`, `CODE_REVIEW` | `REVIEW_POLICY_PATH`, `REVIEW_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |
| `security-auditor` | Brief, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT`, `VERIFICATION_RESULT`, `CODE_REVIEW`, `ARCHITECTURE_REVIEW` | `REVIEW_POLICY_PATH`, `REVIEW_TEMPLATE_PATH`, `EXTERNAL_SOURCES_PATH` |

Symbolic reports are full structured Markdown outputs. A downstream subagent must preserve `BLOCKED` and `ERROR` instead of inferring success from partial file changes.

## Artifact Lifecycle

| Category | Contents | Git behavior | Lifecycle |
| --- | --- | --- | --- |
| A1 | `docs/<KEY>*.md`: snapshots, plans, critique, decisions, tracking | Keep unstaged and out of git history | Preserve for cross-session and cross-runtime resumability unless the user approves cleanup |
| B | Source, tests, config, in-code docs, and standalone documentation the selected task requires | Eligible for normal project handling; lifecycle does not authorize stage/commit/push | Keep as the task's implementation output |
| P | Credentials, tokens, secret-bearing raw logs, unnecessary personal data | Never stage or commit | Do not write or persist |

`documentation-writer` may update Category A1 artifacts on disk. No subagent moves them into git history.

## Successful Completion Contract

All conditions are required:

1. `KICKOFF_REPORT`, `EXECUTION_REPORT`, `DOCUMENTATION_REPORT`, and `FINAL_TRACKING_REPORT` are successful rather than blocked partial progress.
2. `requirements-verifier` returns `PASS`.
3. Clean-code and architecture return `PASS` or `PASS WITH SUGGESTIONS`.
4. Security returns `PASS` or `PASS WITH ADVISORIES`.
5. Category B changes and focused validation results are reflected in reports.
6. The selected task section contains final status, implementation summary, and files changed.
7. The playbook-defined tracking row is updated when present.
8. Final tracker actions run only after conditions 2-4, or are explicitly skipped under the active playbook's optional-capability policy.
9. `FINAL_TASK_REPORT` has status `COMPLETE` and refers only to the selected task.

Partial progress does not satisfy completion.

## Final Task Report Contract

| Status | Meaning | Parent interpretation |
| --- | --- | --- |
| `COMPLETE` | Implementation, documentation/tracking, requirements, all quality gates, and finalization or explicit optional skip succeeded | Mark Phase 7 complete for this task |
| `BLOCKED` | A prerequisite, mandatory capability, workspace state, required tracker action, or handoff is missing or unsafe | Record a Phase 7 resume point |
| `STOPPED_FOR_USER_INPUT` | The next safe step requires a user or upstream planning decision | Pause without completion |
| `ESCALATED` | A retry budget is exhausted or the recovery path is unsafe | Present accumulated findings |

The report includes evidence checked, independent retry counts for requirements, clean-code, architecture, and security, Category B paths, Category A paths, playbook-defined tracker references and actions, blockers, and next action.
