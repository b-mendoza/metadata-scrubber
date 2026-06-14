# PR Creator v2 Workflow

The workflow resolves dispatch mode, inspects fork-aware topology, preflights
with idempotency and pinned SHAs, enforces scope and metadata gates, freezes an
approved preview, and verifies the created or found PR/MR with platform-returned
fields and body digests.

```mermaid
flowchart TD
  START([Start]) --> MODE["Phase 0: resolve execution mode<br/>dispatch or inline"]
  MODE --> INPUTS["Phase 1: normalize inputs<br/>PR_STATE default draft; REVIEWERS none allowed"]
  INPUTS --> REPO["Phase 2: repo-state-inspector<br/>remotes, platform, topology, target candidate"]
  REPO --> REPO_STATUS{"REPO_STATE status"}
  REPO_STATUS -->|BLOCKED or ERROR| FAIL_BLOCKED([PR_CREATE: BLOCKED])
  REPO_STATUS -->|PASS| TOPOLOGY{"Topology resolved?"}
  TOPOLOGY -->|ambiguous| ASK_TOPOLOGY["Ask head/base remotes"]
  ASK_TOPOLOGY -->|answered| TARGET_OK
  ASK_TOPOLOGY -->|pending| AWAIT([PR_CREATE: AWAITING_USER])
  TOPOLOGY -->|yes| TARGET_OK{"TARGET_BRANCH known?"}
  TARGET_OK -->|no| ASK_TARGET["Ask target branch<br/>offer default candidate"]
  ASK_TARGET -->|answered| PLATFORM_CHECK
  ASK_TARGET -->|pending| AWAIT
  TARGET_OK -->|yes| PLATFORM_CHECK{"Adapter or state check needed?"}
  PLATFORM_CHECK -->|yes| ADAPTER["Phase 3: platform adaptation"]
  PLATFORM_CHECK -->|no| STATE_CAP{"Requested state supported?"}
  ADAPTER --> SAFE{"Safe create path known?"}
  SAFE -->|no| ASK_PLATFORM["Ask platform or approved tooling"]
  ASK_PLATFORM -->|answered| ADAPTER
  ASK_PLATFORM -->|pending| AWAIT
  SAFE -->|yes| STATE_CAP
  STATE_CAP -->|no| STATE_GATE["Ask state fallback<br/>ready or stop"]
  STATE_GATE -->|ready| PREFLIGHT
  STATE_GATE -->|stop| FAIL_CANCELLED([PR_CREATE: CANCELLED])
  STATE_CAP -->|yes| PREFLIGHT["Phase 4: preflight-validator<br/>auth, refs, existing PR, pinned SHAs"]

  PREFLIGHT --> PREF_STATUS{"PREFLIGHT status"}
  PREF_STATUS -->|PASS| DIFF["Phase 5: diff-analyzer<br/>pinned base...head range"]
  PREF_STATUS -->|PR_EXISTS| FAIL_EXISTS([PR_CREATE: PR_EXISTS])
  PREF_STATUS -->|PUSH_REQUIRED| PUSH_CYCLE{"Push cycles under 3?"}
  PREF_STATUS -->|PUSH_REJECTED| REJECT_GATE["Ask: stop or user resolved manually"]
  PREF_STATUS -->|AUTH| FAIL_AUTH([PR_CREATE: AUTH])
  PREF_STATUS -->|BASE_BRANCH_MISSING| FAIL_BASE([PR_CREATE: BASE_BRANCH_MISSING])
  PREF_STATUS -->|HEAD_BRANCH_UNPUSHED| FAIL_HEAD([PR_CREATE: HEAD_BRANCH_UNPUSHED])
  PREF_STATUS -->|BLOCKED or ERROR| FAIL_BLOCKED
  PUSH_CYCLE -->|no| FINAL_DECISION["Final decision gate"]
  PUSH_CYCLE -->|yes| PUSH_GATE["Approve plain git push<br/>never force-push"]
  PUSH_GATE -->|approved| PREFLIGHT_PUSH["Redispatch preflight with APPROVAL_RECORD"]
  PUSH_GATE -->|declined| FAIL_HEAD
  PREFLIGHT_PUSH --> PREF_STATUS
  REJECT_GATE -->|resolved manually| PREFLIGHT
  REJECT_GATE -->|stop| FAIL_HEAD

  DIFF --> DIFF_STATUS{"DIFF_ANALYSIS status"}
  DIFF_STATUS -->|PASS| DRAFT["Phase 6: pr-drafter"]
  DIFF_STATUS -->|LARGE_PR_CONFIRMATION_REQUIRED| SCOPE_CYCLE{"Scope cycles under 3?"}
  DIFF_STATUS -->|EMPTY_DIFF| FAIL_EMPTY([PR_CREATE: EMPTY_DIFF])
  DIFF_STATUS -->|ERROR| FAIL_BLOCKED
  SCOPE_CYCLE -->|no| FINAL_DECISION
  SCOPE_CYCLE -->|yes| SCOPE_GATE["Ask large/mixed PR approval"]
  SCOPE_GATE -->|approved| DIFF_RETRY["Redispatch diff-analyzer"]
  SCOPE_GATE -->|declined| FAIL_CANCELLED
  DIFF_RETRY --> DIFF_STATUS

  DRAFT --> DRAFT_STATUS{"PR_DRAFT status"}
  DRAFT_STATUS -->|PASS| META["Phase 7: review-metadata-suggester"]
  DRAFT_STATUS -->|NEEDS_CHOICE| DRAFT_CYCLE{"Type/scope cycles under 3?"}
  DRAFT_STATUS -->|ERROR| FAIL_BLOCKED
  DRAFT_CYCLE -->|no| FINAL_DECISION
  DRAFT_CYCLE -->|yes| TYPE_GATE["Ask type/scope choice"]
  TYPE_GATE -->|answered| DRAFT_RETRY["Redispatch pr-drafter"]
  TYPE_GATE -->|pending| AWAIT
  DRAFT_RETRY --> DRAFT_STATUS

  META --> META_STATUS{"REVIEW_METADATA status"}
  META_STATUS -->|PASS| PREVIEW["Phase 8: exact preview<br/>head SHA and effective state"]
  META_STATUS -->|NEEDS_REVIEWER| REV_CYCLE{"Reviewer cycles under 3?"}
  META_STATUS -->|INVALID_LABELS| LABEL_CYCLE{"Label cycles under 3?"}
  META_STATUS -->|AUTH| FAIL_AUTH
  META_STATUS -->|ERROR| FAIL_BLOCKED
  REV_CYCLE -->|no| FINAL_DECISION
  REV_CYCLE -->|yes| REV_GATE["Ask reviewer or none"]
  REV_GATE -->|answered| META_RETRY["Redispatch metadata"]
  REV_GATE -->|pending| AWAIT
  LABEL_CYCLE -->|no| FINAL_DECISION
  LABEL_CYCLE -->|yes| LABEL_GATE["Ask existing labels or remove"]
  LABEL_GATE -->|answered| META_RETRY
  LABEL_GATE -->|pending| AWAIT
  META_RETRY --> META_STATUS

  PREVIEW --> APPROVAL["Ask exact preview approval"]
  APPROVAL -->|approved| FREEZE["Freeze fields and APPROVAL_RECORD"]
  APPROVAL -->|declined without changes| FAIL_CANCELLED
  APPROVAL -->|changes requested| EDIT_CYCLE{"Preview-edit cycles under 3?"}
  EDIT_CYCLE -->|no| FINAL_DECISION
  EDIT_CYCLE -->|yes| AFFECTED{"Earliest affected phase"}
  AFFECTED -->|branch, remote, platform| REPO
  AFFECTED -->|diff or scope| DIFF
  AFFECTED -->|title or body| DRAFT
  AFFECTED -->|reviewers or labels| META

  FINAL_DECISION -->|exact recovery values| RECOVERY{"Recovery target"}
  FINAL_DECISION -->|stop or unusable| FAIL_ESCALATED([PR_CREATE: ESCALATED])
  RECOVERY -->|repo or branch| REPO
  RECOVERY -->|preflight| PREFLIGHT
  RECOVERY -->|diff| DIFF
  RECOVERY -->|draft| DRAFT
  RECOVERY -->|metadata| META

  FREEZE --> SUBMIT["Phase 9: pr-submitter<br/>head race guard, existing PR check, bounded retry"]
  SUBMIT --> SUBMIT_STATUS{"PR_SUBMIT status"}
  SUBMIT_STATUS -->|HEAD_MOVED| HEAD_MOVED["Explain head moved<br/>counts as preview-edit cycle"]
  HEAD_MOVED --> DIFF
  SUBMIT_STATUS -->|CREATE_UNCERTAIN| FAIL_UNCERTAIN([PR_CREATE: CREATE_UNCERTAIN])
  SUBMIT_STATUS -->|CREATE_ERROR| FAIL_CREATE([PR_CREATE: CREATE_ERROR])
  SUBMIT_STATUS -->|AUTH| FAIL_AUTH
  SUBMIT_STATUS -->|BLOCKED or ERROR| FAIL_BLOCKED
  SUBMIT_STATUS -->|PASS| VERIFY["Orchestrator compares echoed fields and body digests"]
  VERIFY --> VERIFIED{"Every pair matches?"}
  VERIFIED -->|yes| FINAL([Success: verified PR/MR URL])
  VERIFIED -->|no| FAIL_CREATE
```

## Terminal States

| State | Meaning | Terminal? |
| ----- | ------- | --------- |
| `Success` | PR/MR exists and platform-returned fields match the frozen preview. | yes |
| `AWAITING_USER` | A focused question is pending and the run is suspended. | no |
| `PR_EXISTS` | An open PR/MR already targets the same base from the same head. | yes |
| `AUTH`, `BASE_BRANCH_MISSING`, `HEAD_BRANCH_UNPUSHED`, `EMPTY_DIFF`, `BLOCKED` | A precondition or execution step cannot proceed. | yes |
| `CANCELLED` | User declined a scope, state-fallback, or preview gate. | yes |
| `CREATE_ERROR` | Create or verification failed, naming the mismatched field. | yes |
| `CREATE_UNCERTAIN` | Outcome remains unknown after check-then-retry protocol. | yes |
| `ESCALATED` | Three non-converging cycles at one gate without usable recovery. | yes |

## Invariants

- `pr-submitter` runs only after safe platform path, `PREFLIGHT: PASS`,
  `DIFF_ANALYSIS: PASS`, `PR_DRAFT: PASS`, `REVIEW_METADATA: PASS`, exact
  preview approval, and a matching approval record.
- Push, scope, type/scope, reviewer, label, and preview-edit gates each have an
  independent three-cycle counter. Submission has only the bounded retry inside
  `pr-submitter`.
- Every terminal failure uses the shared envelope with status, stopped-at,
  evidence, reason, and one next step.
- Pushes are plain `git push <head_remote> <branch>`; force variants never run.
