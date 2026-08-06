# GitHub Child Work Item Playbook

> Load this file only after detecting GitHub. It supplies every GitHub-specific detail to the neutral coordinator and `child-work-item-creator`. Shared approval, idempotency, retry, repair, and status-pair policy lives in `./phase-4-io-contracts.md` and `./child-creation-playbook.md`.

## Inputs and Identifier

| Input | Required | Example |
| --- | --- | --- |
| `ISSUE_URL` | Yes for Phase 4 writes | `https://github.com/acme/app/issues/42` |
| `TICKET_KEY` | Yes at dispatch; value must equal derived `ISSUE_SLUG` | `acme-app-42` |
| `APPROVED_MUTATION_SCOPE` | Yes before mutation | `Create/reuse GitHub child issues for planned tasks and update docs/acme-app-42-tasks.md` |

Parse `https://<host>/<owner>/<repo>/issues/<number>` directly. Preserve `<host>` for GitHub Enterprise. Lowercase owner/repo only for stable slug construction:

```text
ISSUE_SLUG = <lowercase-owner>-<lowercase-repo>-<number>
<KEY> = ISSUE_SLUG
TICKET_KEY = ISSUE_SLUG value passed under the shared alias
```

Never split `ISSUE_SLUG` to recover owner or repository: either name may contain hyphens. Use the full `ISSUE_URL` for host, owner, repo, number, and `gh` targeting. A missing/malformed URL or a mismatched passed `TICKET_KEY` is `TASK_ISSUES: BLOCKED` with `Validation: NOT_RUN`.

Canonical parent reference: `<owner>/<repo>#<number>`. Local artifact: `docs/<ISSUE_SLUG>-tasks.md`.

## Terminology and Mutation Model

Use these nouns exactly:

- Parent: GitHub issue.
- Concrete child: GitHub issue with either a native sub-issue relationship or explicit linked-issue traceability.
- Native relationship: `sub-issue`.
- Degraded plan-only relationship: `task-list`.
- State: `OPEN` or `CLOSED`; do not call it a Jira status.

Default Phase 4 scope creates/reuses issues and, when supported, links native sub-issues. It does not close issues, change labels, or edit unrelated fields. A parent-side traceability comment is optional for linked-issue mode only when `APPROVED_MUTATION_SCOPE` explicitly includes it; observe existing comments first and never duplicate one.

## Transport and Failure Categories

GitHub reads and writes use `gh`; use `gh api --hostname <host>` or the current host-aware equivalent for REST/GraphQL. Scope every ordinary issue command to the full URL or explicit `<owner>/<repo>`.

Keep these failures distinguishable in `Reason:` and `Failures:` using the tag shown:

| Tag | Condition | Route |
| --- | --- | --- |
| `GH_MISSING` | `gh` executable is unavailable | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |
| `GH_LOGGED_OUT` | No authenticated account/token for the URL host | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |
| `GH_WRONG_HOST` | Authenticated host does not match `ISSUE_URL`, or host targeting is unavailable | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |
| `GH_SCOPE_INSUFFICIENT` | Token/repository permissions cannot read, create, or link as required | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |
| `GH_PARENT_NOT_FOUND` | Parent is missing/inaccessible or repo coordinates conflict | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |
| `GH_RATE_LIMIT` | One 5-second retry is exhausted | Per-task failure; continue safely when possible, otherwise `FAIL` |
| `GH_CAPABILITY_UNAVAILABLE` | No safe approved write path can satisfy a missing task | `TASK_ISSUES: FAIL`, `Validation: NOT_RUN` |

Do not collapse wrong-host, logged-out, missing CLI, and insufficient-scope into a generic auth message.

## Parent and Existing-Link Observation

Verify the parent via `gh issue view` using the full URL and capture number, state, title, URL, host, owner, and repository.

For each existing concrete `owner/repo#N`:

1. Fetch number, state, title, body, URL, and native parent relationship when exposed.
2. Reuse it only when the native relationship or its body traceability points to this exact `ISSUE_URL` / canonical parent reference and its workflow task index matches the plan row.
3. Block if it clearly belongs to another parent, task, or unrelated epic.
4. On resume, search narrowly for a previously created issue carrying this parent URL and task index before creating a replacement.

Existing `task-list` values are reusable only when the current approved scope accepts degraded task-list traceability. Otherwise return `BLOCKED` for a user choice rather than silently upgrading or replacing them.

## Write-Model Discovery

For tasks missing verified accepted traceability, choose the first confirmed and approved path:

1. **`native-sub-issue`** — ordinary issue creation works and installed help, a confirmed extension, or the REST sub-issues endpoint proves native linking.
2. **`linked-issue`** — create a normal issue whose body contains exact parent URL/reference and workflow task index. Native relationship is absent.
3. **`task-list`** — create no concrete child issue; record intentional checklist-style degraded traceability. This is allowed only when concrete child creation/linkage is unavailable for that task and the approval explicitly accepts task-list records. If the approved scope includes editing the parent body, observe it first and reconcile exactly one plain Markdown checkbox per task without duplicating or rewriting unrelated body content. If parent-body editing is not approved, keep the task-list record plan-only and state that limitation in `Capability:` and `Warnings:`.

Capability probe order:

1. Confirm ordinary `gh issue create` capability. Do not infer native sub-issues from ordinary create support.
2. Inspect confirmed installed extensions that expose sub-issue creation.
3. Probe the REST sub-issues endpoint for the parent with current required headers.

Record the result in `Capability:`. The dominant summary `Write model:` is `native-sub-issue`, `linked-issue`, `task-list`, or `mixed`.

Jira's metadata rules and native-subtask-only model do not apply here.

## GitHub Issue Payload Template

For each missing concrete child, title it:

```text
Task <N>: <Short title from plan>
```

Body shape:

```markdown
## Parent

Tracks parent issue: <ISSUE_URL> (`<owner/repo#PARENT_NUMBER>`)

## Task index

Workflow task: **<N>** (from `docs/<ISSUE_SLUG>-tasks.md`)

## Objective

<Objective text from plan>

## Relevant requirements and context

<From plan>

## Dependencies / prerequisites

<From plan or "None">

## Questions to answer before starting

<From plan or "None - all resolved">

## Implementation notes

<Current clarified plan content for this task>

## Definition of done

<From plan>

## Likely files / artifacts affected

<From plan>
```

Always include parent and task-index traceability, including native-sub-issue mode. Require a definite `<owner>/<repo>#<number>` before counting creation. For native mode, create first and then link via the confirmed sub-issues operation. If an attempt is interrupted, re-observe by parent/task traceability before retrying or creating anything else.

## Plan Artifact Contract

Insert or replace one `## GitHub Task Issues` section after `## Issue Summary` when present; otherwise after the first top-level heading.

Immediately under the heading include exactly one comment:

```html
<!-- phase4-handoff parent="owner/repo#N" model="linked-issue" capability="<short free-text>" updated="<ISO-8601 UTC>" -->
```

`updated` is the UTC timestamp of the last Phase 4 write. Preserve it on a read-only rerun; refresh it only when the rerun performs a Phase 4 write.

Allowed `model`: `native-sub-issue`, `linked-issue`, `task-list`, `mixed`.

Fixed workflow table:

```markdown
| Task | Issue ref | Title | Write model | Status | Dependencies | Priority |
| ---- | --------- | ----- | ----------- | ------ | ------------ | -------- |
```

Column rules:

| Column         | Values                                                      |
| -------------- | ----------------------------------------------------------- |
| `Task`         | Integer matching `## Task <N>:`                             |
| `Issue ref`    | `owner/repo#number`, `Not Created`, or `task-list`          |
| `Title`        | Task heading text                                           |
| `Write model`  | `native-sub-issue`, `linked-issue`, `task-list`, or `mixed` |
| `Status`       | `OPEN`, `CLOSED`, `Not Created`, or `task-list`             |
| `Dependencies` | Normalized `None`, `1`, `1,2`, etc.                         |
| `Priority`     | Plan value or `Unknown`                                     |

The first line after each task heading is exactly:

```text
GitHub Task Issue: <owner/repo#number | Not Created | task-list>
```

The inline value must equal that row's `Issue ref`. Use `Not Created` in both `Issue ref` and `Status` when a concrete create/link attempt failed and no approved task-list record is used. Use `task-list` in `Issue ref`, `Write model`, and `Status` only for intentional approved degraded traceability.

## Structured Summary

Return exactly:

```text
TASK_ISSUES: PASS | WARN | FAIL | BLOCKED | ERROR
Validation: PASS | FAIL | NOT_RUN
Parent: <owner/repo#N>
ISSUE_SLUG: <issue_slug>
Plan file: <path | not updated>
Write model: native-sub-issue | linked-issue | task-list | mixed | unknown
Capability: <short detection summary>
Tasks in plan: <n>
Already linked: <n>
Created now: <n>
Failed creates: <n>
Decisions Log: PRESENT | MISSING
Reason: <one line>

Created/Linked Task Issues:
| Task | Issue ref | Title | Write model | Dependencies | Priority | Outcome |
| ---- | --------- | ----- | ----------- | ------------ | -------- | ------- |

Warnings:
- <item or None>

Failures:
- <item or None>
```

`ISSUE_SLUG:`, `Write model:`, and `Capability:` are required on every exit. When no safe task rows exist, use a header-only table.

### Blocked Placeholders

Before a valid URL is parsed:

- `Parent: UNKNOWN`
- `ISSUE_SLUG: UNKNOWN`
- `Plan file: not updated`
- `Write model: unknown`
- `Capability: not checked`
- all counts `0`
- `Decisions Log: MISSING`
- header-only linkage table
- `Reason:` names the URL or approval problem

After a valid URL but missing approval, use the derived parent and `ISSUE_SLUG`, retain the other blocked values, and mutate nothing.

## Status Semantics

| Status | Meaning |
| --- | --- |
| `PASS` | Every task has a verified concrete GitHub issue ref and validation passed |
| `WARN` | Validation passed with missing decisions log, mixed linkage, intentional `task-list`, or failed individual creates represented as `Not Created` |
| `BLOCKED` | Approval, input, plan shape, existing refs, fallback acceptance, or identity is unsafe |
| `FAIL` | Parent verification, transport/auth, capability, create/link, all expected creates, boundary, or post-write validation failed |
| `ERROR` | Unexpected tool, filesystem, schema, or environment failure interrupted the run |

## Child-Reference Values and Downstream Readiness

- A concrete `owner/repo#number` is usable when verified for this parent and task.
- `Not Created` requires manual resolution or a successful rerun before that task enters Phase 5.
- `task-list` is intentional degraded traceability only when approved and reported as `WARN`; the caller must accept it before selecting that task.

## Validation Checklist

- Exactly one `## GitHub Task Issues` section exists.
- The machine handoff comment appears immediately below it and has valid fields.
- Table columns match the fixed order and one row exists per parsed task.
- Every concrete issue resolves and is parent/task consistent.
- Every row has exactly one matching `GitHub Task Issue:` line.
- `Not Created` appears in both row and inline reference and requires `WARN`.
- `task-list` is approved, appears consistently, and requires `WARN`.
- No duplicate remote issue, relationship, comment, label, close, or task-list write was made for an already-satisfied state.
- The only local file changed by this run is `docs/<ISSUE_SLUG>-tasks.md`.

## Rate Limits and External Sources

On a rate limit, wait 5 seconds and retry the same request once. Record `GH_RATE_LIMIT` if exhausted.

Use the `GitHub Source Routing` group in `./external-sources.md`, especially `gh-issue-create`, `gh-issue-view`, `gh-api`, `gh-auth-status`, `github-rest-sub-issues`, `github-task-lists`, `github-permissions`, and `github-rate-limits`.
