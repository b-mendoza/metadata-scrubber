# Committing Scoped Changes

This workflow creates reviewable atomic git commits only after the user explicitly asks to commit. The orchestrator treats `CHANGE_PATHS` as the initial commit allow-list, builds `APPROVED_COMMIT_SCOPE` only from that scope plus exact approved expansions, preserves unrelated work and index entries, and uses specialist subagents for scoped state inspection, commit boundary planning, scoped execution, and post-commit refresh. Existing staged changes are planning facts, not permission to commit. Scope expansion, intentional in-scope omission, ambiguous inputs, unsafe verification recovery, and refresh blockers require one targeted user decision before mutation continues. External references are routed just in time to the active specialist only when they can change that specialist's current decision; initial state inspection may receive only supplied relevant URLs, and raw article text stays out of orchestrator context.

```mermaid
flowchart TD
  START(["Start: user invokes committing-scoped-changes"]) --> INTAKE["Normalize inputs: CHANGE_PATHS, context, style, verification hint"]
  INTAKE --> HAS_PATHS{"CHANGE_PATHS present and unambiguous?"}
  HAS_PATHS -->|no| ASK_PATHS["Ask one targeted question for allowed paths"]
  ASK_PATHS --> STATUS_NEEDS_PATHS["Select COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT for missing or ambiguous CHANGE_PATHS"]
  HAS_PATHS -->|yes| AUTH{"User explicitly asked to create commits?"}

  AUTH -->|no| STATUS_NO_AUTH["Select COMMIT_SCOPED_CHANGES: BLOCKED for missing commit authority"]
  AUTH -->|yes| SET_SCOPE["Set COMMIT_REQUEST_CONFIRMED=true and APPROVED_COMMIT_SCOPE=CHANGE_PATHS"]

  SET_SCOPE --> INIT_STATE_REFS{"Initial state REFERENCE_URLS supplied and clearly relevant?"}
  INIT_STATE_REFS -->|yes| PASS_STATE_REFS["Pass supplied relevant URL(s) only to scoped-state-summarizer; keep raw article text out of orchestrator context"]
  INIT_STATE_REFS -->|no| DISPATCH_STATE["Dispatch scoped-state-summarizer for scoped git state and local context"]
  PASS_STATE_REFS --> DISPATCH_STATE

  DISPATCH_STATE --> STATE_RESULT{"SCOPED_STATE status"}
  STATE_RESULT -->|NO_SCOPED_CHANGES| STATUS_NO_CHANGES["Select COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES"]
  STATE_RESULT -->|NEEDS_CONTEXT| ASK_CONTEXT["Ask one targeted context question"]
  ASK_CONTEXT --> STATUS_WAIT_CONTEXT["Select COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT for state context"]
  STATE_RESULT -->|BLOCKED| STATUS_STATE_BLOCKED["Select COMMIT_SCOPED_CHANGES: BLOCKED from SCOPED_STATE"]
  STATE_RESULT -->|ERROR| STATUS_STATE_ERROR["Select COMMIT_SCOPED_CHANGES: ERROR from SCOPED_STATE"]
  STATE_RESULT -->|PASS| ADOPT_STATE["Adopt scoped summary and Reference need as current source of truth"]

  ADOPT_STATE --> PLAN_REF{"Planner Reference need named for current decision?"}
  PLAN_REF -->|yes| LOOKUP_PLAN_REF["Select only relevant public URL(s) for commit-boundary-planner; keep raw article text out of orchestrator context"]
  PLAN_REF -->|no| PLAN["Dispatch commit-boundary-planner"]
  LOOKUP_PLAN_REF --> PLAN

  PLAN --> PLAN_RESULT{"COMMIT_PLAN status"}
  PLAN_RESULT -->|NEEDS_DECISION| ASK_DECISION["Ask smallest user decision question"]
  ASK_DECISION --> STATUS_WAIT_DECISION["Select COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT for planner decision"]
  PLAN_RESULT -->|BLOCKED| STATUS_PLAN_BLOCKED["Select COMMIT_SCOPED_CHANGES: BLOCKED from COMMIT_PLAN"]
  PLAN_RESULT -->|ERROR| STATUS_PLAN_ERROR["Select COMMIT_SCOPED_CHANGES: ERROR from COMMIT_PLAN"]
  PLAN_RESULT -->|PASS| APPROVE_GROUPS["Use approved commit groups, messages, and verification checks"]

  APPROVE_GROUPS --> G_SCOPE_EXPANSION{"G_SCOPE_EXPANSION: plan includes paths outside CHANGE_PATHS?"}
  G_SCOPE_EXPANSION -->|yes| HUMAN_EXPAND["Human gate: target extra paths, reason, risk, reversibility, safer alternative"]
  HUMAN_EXPAND -->|approved| ADD_APPROVED_SCOPE["Add only approved exact extra paths to APPROVED_COMMIT_SCOPE"]
  ADD_APPROVED_SCOPE --> G_IN_SCOPE_OMISSION{"G_IN_SCOPE_OMISSION: meaningful in-scope changes omitted?"}
  HUMAN_EXPAND -->|declined| STATUS_SCOPE_DECLINED["Select COMMIT_SCOPED_CHANGES: BLOCKED for declined scope expansion"]
  G_SCOPE_EXPANSION -->|no| G_IN_SCOPE_OMISSION

  G_IN_SCOPE_OMISSION -->|yes| HUMAN_OMIT["Human gate: target omitted changes, reason, risk, reversibility, safer alternative"]
  HUMAN_OMIT -->|approved| EXEC_REF{"Executor Reference need for next approved group?"}
  HUMAN_OMIT -->|declined| STATUS_OMISSION_DECLINED["Select COMMIT_SCOPED_CHANGES: BLOCKED for declined in-scope omission"]
  G_IN_SCOPE_OMISSION -->|no| EXEC_REF

  EXEC_REF -->|yes| LOOKUP_EXEC_REF["Select only relevant public URL(s) for scoped-commit-executor; keep raw article text out of orchestrator context"]
  EXEC_REF -->|no| COMMIT_NEXT["Dispatch scoped-commit-executor for next approved group with APPROVED_COMMIT_SCOPE"]
  LOOKUP_EXEC_REF --> COMMIT_NEXT

  COMMIT_NEXT --> EXEC_ACTIONS["Executor isolates preserved staged entries, stages only approved group paths, reviews staged diff, runs verification, creates commit"]
  EXEC_ACTIONS --> EXEC_RESULT{"COMMIT_EXECUTE status"}
  EXEC_RESULT -->|VERIFY_FAILED| RECOVERY_CLASSIFY{"Recovery classification"}
  RECOVERY_CLASSIFY -->|retryable same-scope same-group under cap| RETRY_SAME_GROUP["Increment group attempt counter and retry same approved group"]
  RETRY_SAME_GROUP --> COMMIT_NEXT
  RECOVERY_CLASSIFY -->|needs user decision| ASK_VERIFY["Ask one targeted recovery decision question"]
  ASK_VERIFY --> STATUS_WAIT_VERIFY["Select COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT for verification recovery"]
  RECOVERY_CLASSIFY -->|terminal or attempts exhausted| STATUS_VERIFY_FAILED["Select COMMIT_SCOPED_CHANGES: VERIFY_FAILED"]
  EXEC_RESULT -->|BLOCKED| STATUS_EXEC_BLOCKED["Select COMMIT_SCOPED_CHANGES: BLOCKED from COMMIT_EXECUTE"]
  EXEC_RESULT -->|COMMIT_ERROR| STATUS_COMMIT_ERROR["Select COMMIT_SCOPED_CHANGES: COMMIT_ERROR"]
  EXEC_RESULT -->|ERROR| STATUS_EXEC_ERROR["Select COMMIT_SCOPED_CHANGES: ERROR from COMMIT_EXECUTE"]
  EXEC_RESULT -->|PASS| RECORD_SHA["Record commit SHA and verification evidence"]

  RECORD_SHA --> REFRESH_STATE["Dispatch scoped-state-summarizer with STATE_REFRESH_MODE=post-commit"]
  REFRESH_STATE --> REFRESH_RESULT{"SCOPED_STATE refresh status"}
  REFRESH_RESULT -->|NO_SCOPED_CHANGES| FINAL_SUCCESS["Select success report data from committed SHAs and refreshed state"]
  REFRESH_RESULT -->|NEEDS_CONTEXT| ASK_REFRESH_CONTEXT["Ask one targeted refresh context question"]
  ASK_REFRESH_CONTEXT --> STATUS_WAIT_REFRESH["Select COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT for refresh blocker"]
  REFRESH_RESULT -->|BLOCKED| STATUS_REFRESH_BLOCKED["Select COMMIT_SCOPED_CHANGES: BLOCKED from post-commit refresh"]
  REFRESH_RESULT -->|ERROR| STATUS_REFRESH_ERROR["Select COMMIT_SCOPED_CHANGES: ERROR from post-commit refresh"]
  REFRESH_RESULT -->|PASS| ADOPT_REFRESH["Adopt refreshed scoped summary and refreshed Reference need as source of truth"]

  ADOPT_REFRESH --> REMAINING{"Remaining scoped changes differ from approved plan?"}
  REMAINING -->|yes| PLAN_REF
  REMAINING -->|no| MORE_GROUPS{"More approved groups?"}
  MORE_GROUPS -->|yes| EXEC_REF
  MORE_GROUPS -->|no| FINAL_SUCCESS

  STATUS_NEEDS_PATHS --> FORMAT_STATUS
  STATUS_NO_AUTH --> FORMAT_STATUS
  STATUS_NO_CHANGES --> FORMAT_STATUS
  STATUS_WAIT_CONTEXT --> FORMAT_STATUS
  STATUS_STATE_BLOCKED --> FORMAT_STATUS
  STATUS_STATE_ERROR --> FORMAT_STATUS
  STATUS_WAIT_DECISION --> FORMAT_STATUS
  STATUS_PLAN_BLOCKED --> FORMAT_STATUS
  STATUS_PLAN_ERROR --> FORMAT_STATUS
  STATUS_SCOPE_DECLINED --> FORMAT_STATUS
  STATUS_OMISSION_DECLINED --> FORMAT_STATUS
  STATUS_WAIT_VERIFY --> FORMAT_STATUS
  STATUS_VERIFY_FAILED --> FORMAT_STATUS
  STATUS_EXEC_BLOCKED --> FORMAT_STATUS
  STATUS_COMMIT_ERROR --> FORMAT_STATUS
  STATUS_EXEC_ERROR --> FORMAT_STATUS
  STATUS_WAIT_REFRESH --> FORMAT_STATUS
  STATUS_REFRESH_BLOCKED --> FORMAT_STATUS
  STATUS_REFRESH_ERROR --> FORMAT_STATUS
  FINAL_SUCCESS --> FORMAT_STATUS

  FORMAT_STATUS["Load ./references/report-contract-orchestrator.md and format COMMIT_SCOPED_CHANGES success, failure, or waiting status"]
  FORMAT_STATUS --> DONE(["Return formatted report/status and stop current run"])

  classDef guard fill:#fff3cd,stroke:#856404,color:#000;
  classDef check fill:#e7f1ff,stroke:#0b5ed7,color:#000;
  classDef decision fill:#f8f9fa,stroke:#495057,color:#000;
  classDef human fill:#f3e8ff,stroke:#6f42c1,color:#000;
  classDef output fill:#e8f5e9,stroke:#2e7d32,color:#000;
  classDef stop fill:#fdecea,stroke:#b02a37,color:#000;

  class HAS_PATHS,AUTH,INIT_STATE_REFS,STATE_RESULT,PLAN_REF,PLAN_RESULT,G_SCOPE_EXPANSION,G_IN_SCOPE_OMISSION,EXEC_REF,EXEC_RESULT,RECOVERY_CLASSIFY,REFRESH_RESULT,REMAINING,MORE_GROUPS decision;
  class G_SCOPE_EXPANSION,G_IN_SCOPE_OMISSION guard;
  class INTAKE,SET_SCOPE,PASS_STATE_REFS,DISPATCH_STATE,ADOPT_STATE,LOOKUP_PLAN_REF,PLAN,APPROVE_GROUPS,ADD_APPROVED_SCOPE,LOOKUP_EXEC_REF,COMMIT_NEXT,EXEC_ACTIONS,RETRY_SAME_GROUP,RECORD_SHA,REFRESH_STATE,ADOPT_REFRESH check;
  class ASK_PATHS,ASK_CONTEXT,ASK_DECISION,HUMAN_EXPAND,HUMAN_OMIT,ASK_VERIFY,ASK_REFRESH_CONTEXT human;
  class FORMAT_STATUS,FINAL_SUCCESS,DONE output;
  class STATUS_NEEDS_PATHS,STATUS_NO_AUTH,STATUS_NO_CHANGES,STATUS_WAIT_CONTEXT,STATUS_STATE_BLOCKED,STATUS_STATE_ERROR,STATUS_WAIT_DECISION,STATUS_PLAN_BLOCKED,STATUS_PLAN_ERROR,STATUS_SCOPE_DECLINED,STATUS_OMISSION_DECLINED,STATUS_WAIT_VERIFY,STATUS_VERIFY_FAILED,STATUS_EXEC_BLOCKED,STATUS_COMMIT_ERROR,STATUS_EXEC_ERROR,STATUS_WAIT_REFRESH,STATUS_REFRESH_BLOCKED,STATUS_REFRESH_ERROR stop;
```

Readiness rule: proceed only when commit authority is explicit, `CHANGE_PATHS` is unambiguous, planned groups stay within `APPROVED_COMMIT_SCOPE`, intentional in-scope omissions receive explicit approval, preserved staged entries can be isolated safely, and every post-commit refresh confirms the next safe action.

Final report/status contract: every success, terminal failure, no-change, blocked, error, or waiting outcome loads `./references/report-contract-orchestrator.md` and emits the required `COMMIT_SCOPED_CHANGES` structure before the run stops. A later user answer to a waiting status starts a new run from the relevant upstream context rather than bypassing the formatting contract.

Facts:

| Item | Detail |
| --- | --- |
| Authority | The orchestrator normalizes authority and delegates git inspection, staging, verification, commit creation, and post-commit refresh to specialists. |
| Scope | User-provided `CHANGE_PATHS` starts the commit allow-list; approved exact expansions become `APPROVED_COMMIT_SCOPE`. |
| Existing staged changes | Treated as facts for planning, not as permission to commit; executor preserves unrelated staged entries or blocks before committing. |
| Just-in-time references | Initial state inspection may receive only supplied relevant `REFERENCE_URLS`; planner and executor reference routing uses only URL(s) relevant to the current specialist decision. |
| Raw external text | Raw article or documentation text stays out of orchestrator context; specialists summarize only decision-relevant findings. |
| Verification retry counter | The orchestrator owns one counter per approved group, counts the initial executor dispatch as attempt 1, increments before each same-group retry, caps at three total attempts, and resets on commit success, replan, or next group. |
| Refresh truth source | After `STATE_REFRESH_MODE=post-commit`, `SCOPED_STATE: PASS` replaces prior state as the source of truth for remaining work, replanning, and refreshed `Reference need`. |

Assumptions:

| Item | Detail |
| --- | --- |
| Commit request | `COMMIT_REQUEST_CONFIRMED=true` is set only after the user asks for commits. |
| Report synthesis | The orchestrator loads the final report/status contract after commit execution, post-commit refresh, or terminal/pause status selection. |
| Subagent set | The existing subagents remain in place: `scoped-state-summarizer`, `commit-boundary-planner`, and `scoped-commit-executor`. |

Risks:

| Risk | Mitigation |
| --- | --- |
| Unrelated work could be staged or committed accidentally | Executor stages only approved groups inside `APPROVED_COMMIT_SCOPE`, isolates preserved staged entries, and reviews staged diff before commit. |
| Hooks or generated files can change the worktree | Orchestrator dispatches `scoped-state-summarizer` for post-commit refresh and adopts the refreshed state before continuing. |
| Verification recovery can repeat unsafe actions | Workflow retries only the retryable same-scope same-group path while under the attempt cap; otherwise it asks one targeted question or returns `COMMIT_SCOPED_CHANGES: VERIFY_FAILED`. |
| Scope ambiguity can cause unsafe commits | Workflow separates `G_SCOPE_EXPANSION` from `G_IN_SCOPE_OMISSION`, records exact approved paths in `APPROVED_COMMIT_SCOPE`, and stops for one targeted user decision. |
| External references can pollute context | Reference routing is specialist-local and just in time; raw article text is not accumulated in orchestrator context. |

Blockers:

| Blocker | Terminal State |
| --- | --- |
| Missing or ambiguous `CHANGE_PATHS` | `COMMIT_SCOPED_CHANGES: NEEDS_CONTEXT` |
| No user commit request | `COMMIT_SCOPED_CHANGES: BLOCKED` |
| No meaningful scoped changes | `COMMIT_SCOPED_CHANGES: NO_SCOPED_CHANGES` |
| State, planning, verification, commit, or post-commit refresh failure without safe recovery | Exact `COMMIT_SCOPED_CHANGES` status selected by the failing branch |
| Verification attempts exhausted | `COMMIT_SCOPED_CHANGES: VERIFY_FAILED` |

Unresolved questions:

| Question | Handling |
| --- | --- |
| Should scope expand beyond `CHANGE_PATHS`? | Use `G_SCOPE_EXPANSION`, ask before expanding, and add only approved exact paths to `APPROVED_COMMIT_SCOPE`. |
| Should meaningful in-scope changes be left uncommitted? | Use `G_IN_SCOPE_OMISSION` and ask before leaving them behind. |
| Should verification recovery alter scope, group boundaries, or commit strategy? | Classify as needs user decision; do not retry automatically. |
| Did post-commit hooks or generated files change the next safe action? | Adopt refreshed `SCOPED_STATE` and refreshed `Reference need` before replanning or continuing. |
