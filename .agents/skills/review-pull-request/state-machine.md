# State Machine — review-pull-request

Finite-state execution model for this skill. Mermaid SoT:
[`flow-diagram.md`](./flow-diagram.md). This table is the authoritative list of
states, transitions, guards, and terminals.

Six specialists stay separate: each owns a distinct status prefix
(`CONTEXT`, `FINDINGS`, `COMMENTS`, `VERIFY`, `WRITE`, `POST`). That split is
earned — discovery, drafting, verification, durable write, and gated posting
must not collapse into one agent turn.

## States

| State | Kind | Role |
| ----- | ---- | ---- |
| `NormalizeInputs` | active | Defaults; parse `PR_URL`; init repair counter |
| `GateChoosePr` | active | `HUMAN_GATE_CHOOSE_ONE_PR` when multiple URLs |
| `GateInputNormalization` | active | One PR URL, enums, safe `OUTPUT_FILE` checklist |
| `LoadContracts` | active | Load playbook + relevant status contracts |
| `CollectContext` | active | Dispatch `pr-context-collector` |
| `GateLargeReview` | active | `HUMAN_GATE_LARGE_REVIEW` |
| `CollectNarrowContext` | active | One narrow `pr-context-collector` dispatch |
| `GateNarrowLargeReview` | active | `HUMAN_GATE_NARROW_LARGE_REVIEW` |
| `ReviewFindings` | active | Dispatch `finding-reviewer` |
| `RetryFindings` | active | One findings retry after narrow context |
| `SetNoFindingsDecision` | active | Set `REVIEW_DECISION_CANDIDATE` (`approve`/`comment`) |
| `DraftComments` | active | Dispatch `comment-drafter` |
| `CollectMetadata` | active | Collect requested line metadata once |
| `RetryComments` | active | One comment-drafter retry |
| `Verify` | active | Dispatch `review-verifier` |
| `GateVerifyRepair` | active | Named `Fix target` under repair cap (max 2) |
| `RepairOrchestratorDecision` | active | Reset candidate; re-enter `Verify` |
| `RepairContext` | active | Repair context packet; cascade via findings |
| `RepairFindings` | active | Repair findings; cascade via comments when needed |
| `RepairComments` | active | Repair drafts/metadata; re-enter `Verify` |
| `WriteReview` | active | Dispatch `review-writer` |
| `ConfirmLocalArtifact` | active | Confirm file exists with required sections |
| `GatePostingMode` | active | `draft-only` vs `post-after-confirmation` |
| `BuildPostingPreflight` | active | Exact preview packet; `PREVIEW_APPROVED=false` |
| `GatePreviewApproval` | active | `HUMAN_GATE_FINAL_PREVIEW_APPROVAL` |
| `PostReview` | active | Dispatch `review-poster` (scripts when available) |
| `TerminalVerifiedDraftSaved` | terminal | `PR_REVIEW: VERIFIED_DRAFT_SAVED` |
| `TerminalVerifiedDraftCancelled` | terminal | `PR_REVIEW: VERIFIED_DRAFT_SAVED_POSTING_CANCELLED` |
| `TerminalVerifiedReviewPosted` | terminal | `PR_REVIEW: VERIFIED_REVIEW_POSTED` |
| `TerminalNeedsContext` | terminal | `PR_REVIEW: NEEDS_CONTEXT` |
| `TerminalAuth` | terminal | `PR_REVIEW: AUTH` |
| `TerminalNotFound` | terminal | `PR_REVIEW: NOT_FOUND` |
| `TerminalLargeReview` | terminal | `PR_REVIEW: LARGE_REVIEW` |
| `TerminalReviewError` | terminal | `PR_REVIEW: REVIEW_ERROR` |
| `TerminalVerifyFail` | terminal | `PR_REVIEW: VERIFY_FAIL` |
| `TerminalWriteError` | terminal | `PR_REVIEW: WRITE_ERROR` |
| `TerminalPostError` | terminal | `PR_REVIEW: POST_ERROR` |

## Transitions

| From | To | Guard / event |
| ---- | -- | ------------- |
| `[*]` | `NormalizeInputs` | run start |
| `NormalizeInputs` | `GateChoosePr` | multiple PR URLs present |
| `NormalizeInputs` | `GateInputNormalization` | zero or one candidate URL |
| `GateChoosePr` | `GateInputNormalization` | single PR chosen |
| `GateChoosePr` | `TerminalNeedsContext` | no single PR chosen |
| `GateInputNormalization` | `LoadContracts` | one parseable PR URL; valid enums; safe `OUTPUT_FILE` |
| `GateInputNormalization` | `TerminalNeedsContext` | missing/unparseable URL, invalid enum, or unsafe path |
| `LoadContracts` | `CollectContext` | playbook + status contracts loaded |
| `CollectContext` | `ReviewFindings` | `CONTEXT: PASS` |
| `CollectContext` | `GateLargeReview` | `CONTEXT: LARGE_REVIEW_CONFIRMATION_REQUIRED` |
| `CollectContext` | `TerminalAuth` | `CONTEXT: AUTH` |
| `CollectContext` | `TerminalNotFound` | `CONTEXT: NOT_FOUND` |
| `CollectContext` | `TerminalNeedsContext` | `CONTEXT: NEEDS_CONTEXT` |
| `CollectContext` | `TerminalReviewError` | `CONTEXT: ERROR` |
| `GateLargeReview` | `CollectContext` | approved; `LARGE_REVIEW_APPROVED=true` |
| `GateLargeReview` | `TerminalLargeReview` | declined |
| `ReviewFindings` | `DraftComments` | `FINDINGS: PASS` |
| `ReviewFindings` | `SetNoFindingsDecision` | `FINDINGS: NO_FINDINGS` |
| `ReviewFindings` | `CollectNarrowContext` | `FINDINGS: NEEDS_CONTEXT` (narrow unused) |
| `ReviewFindings` | `TerminalReviewError` | `FINDINGS: ERROR` |
| `CollectNarrowContext` | `RetryFindings` | `CONTEXT: PASS` |
| `CollectNarrowContext` | `GateNarrowLargeReview` | `CONTEXT: LARGE_REVIEW_CONFIRMATION_REQUIRED` |
| `CollectNarrowContext` | `TerminalAuth` | `CONTEXT: AUTH` |
| `CollectNarrowContext` | `TerminalNotFound` | `CONTEXT: NOT_FOUND` |
| `CollectNarrowContext` | `TerminalNeedsContext` | `CONTEXT: NEEDS_CONTEXT` |
| `CollectNarrowContext` | `TerminalReviewError` | `CONTEXT: ERROR` |
| `GateNarrowLargeReview` | `CollectNarrowContext` | approved; narrow + `LARGE_REVIEW_APPROVED=true` |
| `GateNarrowLargeReview` | `TerminalLargeReview` | declined |
| `RetryFindings` | `DraftComments` | `FINDINGS: PASS` |
| `RetryFindings` | `SetNoFindingsDecision` | `FINDINGS: NO_FINDINGS` |
| `RetryFindings` | `TerminalNeedsContext` | `FINDINGS: NEEDS_CONTEXT` |
| `RetryFindings` | `TerminalReviewError` | `FINDINGS: ERROR` |
| `SetNoFindingsDecision` | `Verify` | candidate set (`approve` only if no blocking residual risk; else `comment`) |
| `DraftComments` | `Verify` | `COMMENTS: PASS` |
| `DraftComments` | `CollectMetadata` | `COMMENTS: NEEDS_METADATA` |
| `DraftComments` | `TerminalReviewError` | `COMMENTS: ERROR` |
| `CollectMetadata` | `RetryComments` | requested metadata collected |
| `RetryComments` | `Verify` | `COMMENTS: PASS` |
| `RetryComments` | `TerminalReviewError` | `COMMENTS: NEEDS_METADATA` or `ERROR` |
| `Verify` | `WriteReview` | `VERIFY: PASS` |
| `Verify` | `GateVerifyRepair` | `VERIFY: FAIL` with `Fix target`; repair cycles &lt; 2 |
| `Verify` | `TerminalVerifyFail` | `VERIFY: FAIL` and repair cycles ≥ 2 |
| `Verify` | `TerminalNeedsContext` | `VERIFY: NEEDS_CONTEXT` |
| `Verify` | `TerminalReviewError` | `VERIFY: ERROR` |
| `GateVerifyRepair` | `RepairOrchestratorDecision` | Fix target `orchestrator-decision` |
| `GateVerifyRepair` | `RepairContext` | Fix target `pr-context-collector` |
| `GateVerifyRepair` | `RepairFindings` | Fix target `finding-reviewer` |
| `GateVerifyRepair` | `RepairComments` | Fix target `comment-drafter` |
| `RepairOrchestratorDecision` | `Verify` | candidate reset |
| `RepairContext` | `ReviewFindings` | context packet repaired |
| `RepairFindings` | `DraftComments` | findings repaired and findings exist |
| `RepairFindings` | `SetNoFindingsDecision` | findings repaired to `NO_FINDINGS` |
| `RepairComments` | `Verify` | drafts/metadata repaired |
| `WriteReview` | `ConfirmLocalArtifact` | `WRITE: PASS` |
| `WriteReview` | `TerminalWriteError` | `WRITE: ERROR` |
| `ConfirmLocalArtifact` | `GatePostingMode` | file exists; required sections present |
| `GatePostingMode` | `TerminalVerifiedDraftSaved` | `POSTING_MODE=draft-only` |
| `GatePostingMode` | `BuildPostingPreflight` | `POSTING_MODE=post-after-confirmation` |
| `BuildPostingPreflight` | `GatePreviewApproval` | preflight built (`PREVIEW_APPROVED=false`) |
| `GatePreviewApproval` | `TerminalVerifiedDraftCancelled` | user declined |
| `GatePreviewApproval` | `PostReview` | approved; packet complete; `PREVIEW_APPROVED=true` |
| `GatePreviewApproval` | `TerminalPostError` | approved but packet incomplete |
| `PostReview` | `TerminalVerifiedReviewPosted` | `POST: PASS` |
| `PostReview` | `TerminalPostError` | `POST: PREVIEW_REQUIRED`, `AUTH`, `METADATA_INVALID`, or `ERROR` |

## Terminal states

| State | Outcome |
| ----- | ------- |
| `TerminalVerifiedDraftSaved` | Success — local draft only |
| `TerminalVerifiedDraftCancelled` | Success — draft kept; posting cancelled |
| `TerminalVerifiedReviewPosted` | Success — posted and read back |
| `TerminalNeedsContext` | Failure — input/context unresolved |
| `TerminalAuth` | Failure — auth/permission |
| `TerminalNotFound` | Failure — PR/repo missing |
| `TerminalLargeReview` | Failure — large-review declined |
| `TerminalReviewError` | Failure — unexpected phase error |
| `TerminalVerifyFail` | Failure — repair exhausted |
| `TerminalWriteError` | Failure — artifact write |
| `TerminalPostError` | Failure — posting path |

## Properties

- Every active state is reachable from `NormalizeInputs`.
- Every terminal is reachable; no dead states.
- Repair cap: at most two `VERIFY: FAIL` repair cycles, then `TerminalVerifyFail`.
- Narrow findings path and metadata path each allow one retry, then terminal.
- Posting never runs without `GatePreviewApproval` success and a complete packet.
