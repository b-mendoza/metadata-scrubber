# review-pull-request single-PR review workflow

Finite-state control flow for the single-PR review orchestrator
(`stateDiagram-v2`). Companion transition table:
[`state-machine.md`](./state-machine.md).

Normalize one GitHub PR, collect compact context, surface evidence-backed
findings, draft GitHub-ready comments, verify, write a local Markdown review,
and optionally post the exact verified preview after human approval. Raw diffs,
logs, API payloads, and fetched pages stay inside phase subagents. The workflow
never merges, deploys, bypasses CI, or posts without the final preview gate.

```mermaid
stateDiagram-v2
  [*] --> NormalizeInputs

  NormalizeInputs --> GateChoosePr: multiple PR URLs
  NormalizeInputs --> GateInputNormalization: zero or one URL

  GateChoosePr --> GateInputNormalization: single PR chosen
  GateChoosePr --> TerminalNeedsContext: none chosen

  GateInputNormalization --> LoadContracts: valid inputs and safe OUTPUT_FILE
  GateInputNormalization --> TerminalNeedsContext: invalid input or unsafe path

  LoadContracts --> CollectContext: contracts loaded

  CollectContext --> ReviewFindings: CONTEXT PASS
  CollectContext --> GateLargeReview: LARGE_REVIEW_CONFIRMATION_REQUIRED
  CollectContext --> TerminalAuth: CONTEXT AUTH
  CollectContext --> TerminalNotFound: CONTEXT NOT_FOUND
  CollectContext --> TerminalNeedsContext: CONTEXT NEEDS_CONTEXT
  CollectContext --> TerminalReviewError: CONTEXT ERROR

  GateLargeReview --> CollectContext: approved LARGE_REVIEW_APPROVED
  GateLargeReview --> TerminalLargeReview: declined

  ReviewFindings --> DraftComments: FINDINGS PASS
  ReviewFindings --> SetNoFindingsDecision: FINDINGS NO_FINDINGS
  ReviewFindings --> CollectNarrowContext: FINDINGS NEEDS_CONTEXT
  ReviewFindings --> TerminalReviewError: FINDINGS ERROR

  CollectNarrowContext --> RetryFindings: CONTEXT PASS
  CollectNarrowContext --> GateNarrowLargeReview: LARGE_REVIEW_CONFIRMATION_REQUIRED
  CollectNarrowContext --> TerminalAuth: CONTEXT AUTH
  CollectNarrowContext --> TerminalNotFound: CONTEXT NOT_FOUND
  CollectNarrowContext --> TerminalNeedsContext: CONTEXT NEEDS_CONTEXT
  CollectNarrowContext --> TerminalReviewError: CONTEXT ERROR

  GateNarrowLargeReview --> CollectNarrowContext: approved narrow LARGE_REVIEW_APPROVED
  GateNarrowLargeReview --> TerminalLargeReview: declined

  RetryFindings --> DraftComments: FINDINGS PASS
  RetryFindings --> SetNoFindingsDecision: FINDINGS NO_FINDINGS
  RetryFindings --> TerminalNeedsContext: FINDINGS NEEDS_CONTEXT
  RetryFindings --> TerminalReviewError: FINDINGS ERROR

  SetNoFindingsDecision --> Verify: candidate set

  DraftComments --> Verify: COMMENTS PASS
  DraftComments --> CollectMetadata: COMMENTS NEEDS_METADATA
  DraftComments --> TerminalReviewError: COMMENTS ERROR

  CollectMetadata --> RetryComments: metadata collected

  RetryComments --> Verify: COMMENTS PASS
  RetryComments --> TerminalReviewError: NEEDS_METADATA or ERROR

  Verify --> WriteReview: VERIFY PASS
  Verify --> GateVerifyRepair: VERIFY FAIL under repair cap
  Verify --> TerminalVerifyFail: VERIFY FAIL repair exhausted
  Verify --> TerminalNeedsContext: VERIFY NEEDS_CONTEXT
  Verify --> TerminalReviewError: VERIFY ERROR

  GateVerifyRepair --> RepairOrchestratorDecision: Fix target orchestrator-decision
  GateVerifyRepair --> RepairContext: Fix target pr-context-collector
  GateVerifyRepair --> RepairFindings: Fix target finding-reviewer
  GateVerifyRepair --> RepairComments: Fix target comment-drafter

  RepairOrchestratorDecision --> Verify: candidate reset
  RepairContext --> ReviewFindings: context repaired
  RepairFindings --> DraftComments: findings exist
  RepairFindings --> SetNoFindingsDecision: NO_FINDINGS
  RepairComments --> Verify: comments repaired

  WriteReview --> ConfirmLocalArtifact: WRITE PASS
  WriteReview --> TerminalWriteError: WRITE ERROR

  ConfirmLocalArtifact --> GatePostingMode: artifact confirmed

  GatePostingMode --> TerminalVerifiedDraftSaved: draft-only
  GatePostingMode --> BuildPostingPreflight: post-after-confirmation

  BuildPostingPreflight --> GatePreviewApproval: preflight ready

  GatePreviewApproval --> TerminalVerifiedDraftCancelled: declined
  GatePreviewApproval --> PostReview: approved packet complete
  GatePreviewApproval --> TerminalPostError: approved packet incomplete

  PostReview --> TerminalVerifiedReviewPosted: POST PASS
  PostReview --> TerminalPostError: PREVIEW_REQUIRED or AUTH or METADATA_INVALID or ERROR

  TerminalVerifiedDraftSaved --> [*]
  TerminalVerifiedDraftCancelled --> [*]
  TerminalVerifiedReviewPosted --> [*]
  TerminalNeedsContext --> [*]
  TerminalAuth --> [*]
  TerminalNotFound --> [*]
  TerminalLargeReview --> [*]
  TerminalReviewError --> [*]
  TerminalVerifyFail --> [*]
  TerminalWriteError --> [*]
  TerminalPostError --> [*]
```

## Canonical rules

- Readiness: local artifact only after `VERIFY: PASS` and `WRITE: PASS`.
- Input normalization: invalid inputs stop before phase subagent dispatch.
- Safe `OUTPUT_FILE`: relative `.md` path inside the workspace; no `..`, no
  absolute paths, no non-Markdown extensions (see `SKILL.md` intake).
- Large-review: shortstat, changed-file groups, and trigger criterion required
  on `CONTEXT: LARGE_REVIEW_CONFIRMATION_REQUIRED`.
- Verify repair: exactly one `Fix target`; cascades per
  [`state-machine.md`](./state-machine.md); max two repair cycles.
- Posting: only when `POSTING_MODE=post-after-confirmation`, exact verified
  preview approved, `PREVIEW_APPROVED=true`, `REVIEW_DECISION` present, and
  comments/metadata verified.

## Terminal outcomes

- `PR_REVIEW: VERIFIED_DRAFT_SAVED`
- `PR_REVIEW: VERIFIED_DRAFT_SAVED_POSTING_CANCELLED`
- `PR_REVIEW: VERIFIED_REVIEW_POSTED`
- `PR_REVIEW: NEEDS_CONTEXT`
- `PR_REVIEW: AUTH`
- `PR_REVIEW: NOT_FOUND`
- `PR_REVIEW: LARGE_REVIEW`
- `PR_REVIEW: VERIFY_FAIL`
- `PR_REVIEW: WRITE_ERROR`
- `PR_REVIEW: POST_ERROR`
- `PR_REVIEW: REVIEW_ERROR`

## Source-backed rationale

- GitHub review creation requires owner, repo, and pull number and supports
  `APPROVE`, `REQUEST_CHANGES`, and `COMMENT`: [GitHub REST create
  review](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).
- Line comments need precise diff metadata: [GitHub REST review
  comments](https://docs.github.com/en/rest/pulls/comments#create-a-review-comment-for-a-pull-request).
- Constrain user-supplied paths: [OWASP Path
  Traversal](https://owasp.org/www-community/attacks/Path_Traversal).
- Large changes are reviewed less thoroughly: [Google Engineering Practices:
  Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html).
- Quality-critical workflows need steps, guardrails, and feedback loops:
  [Anthropic skill best
  practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).
- Staged disclosure should be task-driven: [Nielsen Norman Group progressive
  disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
