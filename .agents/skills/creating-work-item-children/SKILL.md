---
name: "creating-work-item-children"
description: "Creates or reconciles GitHub child task issues or Jira subtasks from an approved Phase 4 task plan, then updates docs/<KEY>-tasks.md with validated remote linkage. Use after the task plan has been clarified and the user has approved the exact platform writes plus scoped plan-file update."
---

# Creating Work Item Children

You are the Phase 4 child-work-item coordinator. Detect the platform, derive the workflow key per the active playbook, enforce the mutation-approval boundary, dispatch `child-work-item-creator`, route on its structured summary, and explain the outcome in prose.

This skill mutates a real remote tracker and one local workflow plan. The creator owns plan parsing, platform reads and writes, idempotent reconciliation, plan-file edits, and validation. Keep raw platform payloads, full plan contents, and command output out of coordinator context.

## Platform Detection

Detect the platform from the canonical parent URL and load the matching playbook for every platform-specific decision:

| Input signal                                                                                  | Platform | Playbook                                                             |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `ISSUE_URL` matching `https://<host>/<owner>/<repo>/issues/<N>` (including GitHub Enterprise) | `github` | [`./references/github-playbook.md`](./references/github-playbook.md) |
| `JIRA_URL` matching `https://<workspace>.atlassian.net/browse/<KEY>`                          | `jira`   | [`./references/jira-playbook.md`](./references/jira-playbook.md)     |

If neither signal is present or the reference is ambiguous, ask one targeted clarification question before any dispatch or mutation. Do not derive GitHub owner/repo/number by splitting `ISSUE_SLUG`; owner and repository names may contain hyphens. Phase 4 GitHub runs require the full `ISSUE_URL`.

The shared workflow key is `<KEY>`. Pass it under the established alias `TICKET_KEY`: Jira uses its ticket key; GitHub uses the playbook-derived `ISSUE_SLUG` value.

## Inputs

| Input                                             | Required                                                             | Example                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Canonical parent URL named by the active playbook | Yes                                                                  | `ISSUE_URL=https://github.com/acme/app/issues/42` or `JIRA_URL=https://workspace.atlassian.net/browse/PROJ-123` |
| `APPROVED_MUTATION_SCOPE`                         | Normal orchestrated runs; may be collected once on direct invocation | `Create missing child work items for Tasks 1-3 and update docs/<KEY>-tasks.md`                                  |

The approval must cover the active playbook's exact remote write model and the single local file `docs/<KEY>-tasks.md`. If direct invocation has unclear approval, ask once. If approval is absent or declined, create or edit nothing and explain the approval boundary in prose, without the internal blocked-summary envelope.

## Mutation Boundaries

Derive the run's mutation limits from `APPROVED_MUTATION_SCOPE` and pass them to the creator unchanged:

- Observe the parent, plan, and existing child linkage before every mutation.
- Reuse an already-satisfied verified relationship as success; do not duplicate issues, subtasks, parent links, comments, labels, task-list entries, or transitions.
- Remote writes are limited to the active playbook's approved Phase 4 actions for tasks parsed from `docs/<KEY>-tasks.md` and the identified parent.
- The only local file that may change is `docs/<KEY>-tasks.md`.
- Repair cycles may change only the local plan representation and may not make additional remote writes.
- Implementation, branches, commits, pushes, unrelated tracker fields, sibling work items, and any file outside the plan are out of scope.

Treat the updated plan as persistent workflow state: leave it on disk and unstaged. Approval to mutate the tracker or plan never grants authority to stage, commit, or push.

## Output Contract

The creator returns the active playbook's preserved structured summary to this coordinator only. Its platform-specific status prefix (`TASK_ISSUES:` or `SUBTASKS:`), `Validation: PASS | FAIL | NOT_RUN`, and identifier fields remain internal routing data. The public reply explains the outcome in prose, without those status lines or a key/value routing envelope. Preserve the parent, plan path, counts, write model and capability where applicable, Created/Linked table rows, warnings, failures, and next action. The active playbook owns table columns, terminology, and accepted child-reference values.

On successful or partial reconciliation, `docs/<KEY>-tasks.md` contains exactly one playbook-defined workflow-level child table and exactly one matching inline child reference in every numbered task section. Accepted concrete, unresolved, and degraded values come only from the active playbook's **Child-Reference Values and Downstream Readiness** section.

## Subagent Registry

| Subagent                  | Path                                                                               | Purpose                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child-work-item-creator` | [`./subagents/child-work-item-creator.md`](./subagents/child-work-item-creator.md) | Observes current state, reconciles missing remote child work items through the active playbook, updates the one plan file, validates it, and returns the platform summary |

Read the subagent file only when dispatching it.

## Progressive Disclosure Map

| Need                                                                                                                                                  | Load                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Platform inputs, identifier derivation, transport, auth/capability categories, write model, exact headings, summary shape, terminology, and templates | Active `./references/<platform>-playbook.md`                                   |
| Shared observe-before-mutate sequence, idempotency, retry, repair, and summary routing                                                                | `./references/child-creation-playbook.md` inside the creator                   |
| Shared lifecycle, validation, and status-pair rules                                                                                                   | `./references/phase-4-io-contracts.md`                                         |
| Current public CLI/API/configuration syntax                                                                                                           | `./references/external-sources.md`, then only the active playbook's routed URL |
| Creator behavior                                                                                                                                      | `./subagents/child-work-item-creator.md` only when dispatching                 |

## Dispatch Pattern

```text
PLAYBOOK_PATH: ../references/<platform>-playbook.md
<canonical parent URL named by the active playbook>
TICKET_KEY: <KEY>
APPROVED_MUTATION_SCOPE: <exact approved remote actions plus docs/<KEY>-tasks.md>
CREATION_PLAYBOOK_PATH: ../references/child-creation-playbook.md
IO_CONTRACT_PATH: ../references/phase-4-io-contracts.md
EXTERNAL_SOURCES_PATH: ../references/external-sources.md
```

These paths are relative to `./subagents/child-work-item-creator.md`, the file that consumes them. The active playbook supplies every platform-specific detail; do not add transport or tracker vocabulary to the neutral dispatch.

## Workflow

1. Detect the platform, load its playbook, validate the canonical parent URL, and derive `<KEY>` per the playbook.
2. Confirm `APPROVED_MUTATION_SCOPE`. On direct invocation, ask once if unclear; absent or declined approval stops without mutations. Explain the missing approval and unchanged state in prose; do not expose internal blocked-summary fields.
3. Dispatch `child-work-item-creator` using the pattern above.
4. Route on the playbook-defined status prefix together with `Validation:`.
5. Render the creator result as a concise prose rollup and the Created/Linked table. Include the parent, plan path, counts, warnings, failures, and the fact that implementation has not begun. Never echo the internal routing envelope. An approval gate still shows the exact proposed actions and asks for approval before ending the turn.

## Routing Rules

| Result                                                                      | Coordinator action                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Playbook status `PASS` with `Validation: PASS`                              | Report complete verified linkage and proceed                                                                        |
| Playbook status `WARN` with `Validation: PASS`                              | Report usable concrete linkage and surface every degraded or unresolved row before task selection                   |
| Playbook status `BLOCKED`                                                   | Stop and surface the approval, input, plan-shape, linkage, or platform-choice blocker                               |
| Playbook status `FAIL`                                                      | Stop and surface the categorized transport, permission, configuration, create/link, boundary, or validation failure |
| Playbook status `ERROR`, `Validation: FAIL`, or an undefined status pairing | Stop and surface the unexpected or contract failure                                                                 |

`Validation: NOT_RUN` is incomplete Phase 4 output even when the top-level status is already `BLOCKED`, `FAIL`, or `ERROR`. Use the shared I/O contract and active playbook to reject inconsistent pairings rather than guessing.

## Example

<example>
Input: `ISSUE_URL=https://github.com/acme/app/issues/42` with approval for
GitHub child issue writes and `docs/acme-app-42-tasks.md`.

Detect `github`, derive `TICKET_KEY=acme-app-42` from the full URL, dispatch the creator with `PLAYBOOK_PATH=../references/github-playbook.md`, and route the returned `TASK_ISSUES` plus `Validation` lines. Apply only the write paths and downstream semantics defined by the loaded playbook; never import a fallback from another playbook. </example>
