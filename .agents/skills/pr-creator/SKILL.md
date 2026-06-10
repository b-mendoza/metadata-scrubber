---
name: "pr-creator"
description: "Create review-ready pull requests from the current branch with a preview-first, user-approved workflow. Use when the user asks to create, open, draft, or submit a PR, pull request, merge request, or code review request, or says their branch is ready for review."
---

# PR Creator

You are a pull request creation orchestrator. Think, route, and ask for user
approval; delegate repository inspection, diff analysis, drafting, metadata, and
submission to focused subagents that return concise status blocks.

This skill is standalone. Bundled paths are relative to the file that contains
them and stay inside this skill folder.
External URLs are public just-in-time sources; fetch them only when exact syntax,
platform behavior, or background rationale is needed.

## Inputs

| Input | Required | Example |
| ----- | -------- | ------- |
| `TARGET_BRANCH` | No | `main` |
| `PR_STATE` | No | `draft` or `ready` |
| `REMOTE_NAME` | No | `origin` |
| `REVIEWERS` | No | `alice,bob` |
| `TITLE_OVERRIDE` | No | `docs(skills): refine pr-creator workflow` |
| `BODY_OVERRIDE` | No | `## Summary\n...` |
| `LABELS_OVERRIDE` | No | `documentation,enhancement` |

Ask for `TARGET_BRANCH` when missing and for `PR_STATE` when it is not `draft`
or `ready`. Default `PR_STATE` to `draft` and `REMOTE_NAME` to `origin`. Treat
title, body, reviewer, and label overrides as exact user intent after platform
validation.

## Progressive Loading Map

| Need | Load |
| ---- | ---- |
| Phase routing, user gates, and subagent selection | This file only |
| Failure envelope, preview block, final output, body template | `./references/execution-contracts.md` |
| Current CLI syntax, platform docs, PR-writing guidance, progressive-disclosure background | `./references/external-resources.md`, then fetch one relevant URL |
| GitLab, Bitbucket, or unknown platform behavior | `./references/platform-adaptation.md` |
| Workflow visualization or maintenance check | `./flow-diagram.md` |
| Specialist execution | The selected file under `./subagents/` |
| Specialist return shape | The matching file under `./references/contracts/` |

## Subagent Registry

| Subagent | Path | Contract | Purpose |
| -------- | ---- | -------- | ------- |
| `repo-state-inspector` | `./subagents/repo-state-inspector.md` | `./references/contracts/repo-state-inspector.md` | Reports repository, branch, platform, and working-tree routing state |
| `preflight-validator` | `./subagents/preflight-validator.md` | `./references/contracts/preflight-validator.md` | Verifies auth, base ref, head ref, and approved push state |
| `diff-analyzer` | `./subagents/diff-analyzer.md` | `./references/contracts/diff-analyzer.md` | Summarizes the trusted compare diff and size gates |
| `pr-drafter` | `./subagents/pr-drafter.md` | `./references/contracts/pr-drafter.md` | Creates title and body from diff facts or exact overrides |
| `review-metadata-suggester` | `./subagents/review-metadata-suggester.md` | `./references/contracts/review-metadata-suggester.md` | Resolves reviewers and platform-valid labels |
| `pr-submitter` | `./subagents/pr-submitter.md` | `./references/contracts/pr-submitter.md` | Creates and verifies the approved PR or MR |

Pass the contract path to the selected subagent. Load subagent files, contract
files, and external resources only at the phase that needs them.

## Workflow

1. Normalize inputs inline and ask the smallest missing-value question.
2. Dispatch `repo-state-inspector` with `REMOTE_NAME`. Continue only on
   `REPO_STATE: PASS`. If local changes exist, state that they are outside the
   PR until committed. Record the returned remote name, platform, and
   adapter-needed fields before loading
   `./references/platform-adaptation.md`.
3. When the platform is GitLab, Bitbucket, GitHub Enterprise, or unknown, load
   `./references/platform-adaptation.md`; fetch external docs only for exact
   active-platform syntax. If a safe platform path is still unknown, ask which
   hosting platform or tooling to use.
4. Dispatch `preflight-validator` with the recorded remote name. Route
   `PREFLIGHT: PUSH_REQUIRED` to a push approval gate, then redispatch only
   `preflight-validator` with `PUSH_APPROVED=true` after explicit approval.
5. Dispatch `diff-analyzer` with the recorded remote name only after
   `PREFLIGHT: PASS`. If it returns
   `DIFF_ANALYSIS: LARGE_PR_CONFIRMATION_REQUIRED`, ask whether to proceed as
   one PR, then redispatch only `diff-analyzer` with `LARGE_PR_APPROVED=true`
   when approved.
6. Dispatch `pr-drafter`, then `review-metadata-suggester` with the recorded
   remote name and exact changed-file paths from `DIFF_ANALYSIS`. Resolve
   `PR_DRAFT: NEEDS_CHOICE`, `REVIEW_METADATA: NEEDS_REVIEWER`, and
   `REVIEW_METADATA: INVALID_LABELS` with one focused user question and
   redispatch only the affected subagent.
7. Load `./references/execution-contracts.md`, show the exact preview, and ask
   for approval. Any edit to branch, state, title, body, reviewers, or labels
   invalidates approval and re-runs the earliest affected phase.
8. Freeze approved preview fields, then dispatch `pr-submitter` with the
   recorded remote name and only the approved preview values. Verify URL, base,
   head, title, body, state, reviewers, and labels before returning the final
   success block.

For any non-pass status, load `./references/execution-contracts.md`, map the
status to the failure envelope, and recover only the failing gate. Stop after
three non-converging preflight, scope, draft, reviewer, label, preview, or
submission cycles and ask the user for exact recovery values or permission to
stop.

## Status Routing

| Source | Continue | User gate or retry | Failure envelope mapping |
| ------ | -------- | ------------------ | ------------------------ |
| `REPO_STATE` | `PASS` | none | `BLOCKED` or `ERROR` -> `BLOCKED` |
| `PREFLIGHT` | `PASS` | `PUSH_REQUIRED` -> push approval then `PUSH_APPROVED=true` | `AUTH` -> `AUTH`; `BASE_BRANCH_MISSING` -> `BASE_BRANCH_MISSING`; `HEAD_BRANCH_UNPUSHED` or unresolved `PUSH_REQUIRED` -> `HEAD_BRANCH_UNPUSHED`; `BLOCKED` or `ERROR` -> `BLOCKED` |
| `DIFF_ANALYSIS` | `PASS` | `LARGE_PR_CONFIRMATION_REQUIRED` -> scope approval then `LARGE_PR_APPROVED=true` | declined large-PR gate -> `CANCELLED`; `EMPTY_DIFF` -> `EMPTY_DIFF`; `ERROR` -> `BLOCKED` |
| `PR_DRAFT` | `PASS` | `NEEDS_CHOICE` -> one type or scope choice | unresolved `NEEDS_CHOICE` or `ERROR` -> `BLOCKED` |
| `REVIEW_METADATA` | `PASS` | `NEEDS_REVIEWER`, `INVALID_LABELS` -> one metadata question | unresolved reviewer or label gate -> `BLOCKED`; `AUTH` -> `AUTH`; `ERROR` -> `BLOCKED` |
| `PR_SUBMIT` | `PASS` | none | `AUTH` -> `AUTH`; `CREATE_ERROR` -> `CREATE_ERROR`; `BLOCKED` or `ERROR` -> `BLOCKED` |

## Core Rules

- Use `<remote_name>/<target_branch>...<remote_name>/<current_branch>` as the
  trusted diff only after preflight confirms both remote refs are comparable.
- Pass exact changed-file paths, not grouped summaries, to metadata resolution.
- Ask before pushing, before proceeding with a large or mixed-purpose PR, and
  before creating the PR.
- Require at least one reviewer from user input, platform-valid CODEOWNERS, or
  an explicit user answer before submission.
- Use only labels that the hosting platform reports as existing.
- Preserve approved preview fields exactly during submission; any change to
  branch, state, title, body, reviewers, or labels requires a new preview
  approval.
- Fetch external URLs for static guidance instead of copying that guidance into
  the prompt; preserve this skill's local contracts when sources disagree.

## Output Contract

Success output uses the final block in `./references/execution-contracts.md`.
Blocked or failed output uses that file's failure envelope with one clear next
step.

## Example

<example>
Input: `TARGET_BRANCH=main`, `PR_STATE=draft`.

1. `repo-state-inspector` returns `REPO_STATE: PASS` for a GitHub branch on
   `origin`.
2. `preflight-validator` returns `PREFLIGHT: PASS` after verifying remote refs.
3. `diff-analyzer` returns a documentation-only diff summary.
4. `pr-drafter` and `review-metadata-suggester` return preview-ready fields.
5. The orchestrator loads `./references/execution-contracts.md`, shows the
   preview, receives approval, and dispatches `pr-submitter`.
6. `pr-submitter` returns `PR_SUBMIT: PASS` with a verified PR URL.
</example>
