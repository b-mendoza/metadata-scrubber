# Planning Task Execution

This platform-neutral state-machine diagram is illustrative. The routing, status, retry, and re-plan rules in `./references/pipeline.md` and `SKILL.md` are authoritative if prose and diagram ever drift.

The coordinator plans exactly one selected `TASK_NUMBER`. The active playbook derives `<KEY>` and supplies platform-specific terminology and readiness semantics. No route advances to another task, implements code, or mutates the work-item platform.

```mermaid
flowchart TD
  START([Start planning-task-execution]) --> DETECT[Resolve identity inputs, detect platform, and load active playbook]
  DETECT --> INTAKE[Normalize workflow key alias, TASK_NUMBER, INVOCATION_MODE, optional RE_PLAN and DECISIONS_FILE]
  INTAKE --> REQUIRED_INPUTS{Identity inputs non-conflicting, platform key valid, and task number positive?}
  REQUIRED_INPUTS -->|conflicting identities| FAIL_INPUTS([FAIL: conflicting work-item identity])
  REQUIRED_INPUTS -->|missing, malformed, or ambiguous| BLOCKED_INPUTS([BLOCKED: input needs clarification])
  REQUIRED_INPUTS -->|yes| SET_LIMITS[Set one-task mutation limits for four artifact paths]
  SET_LIMITS --> REPLAN_CHECK{RE_PLAN requested?}

  REPLAN_CHECK -->|no| SET_PREP[Set first stage: execution-prepper]
  REPLAN_CHECK -->|yes| INVALIDATE[Identify earliest invalidated stage and downstream dependents]
  INVALIDATE --> REPLAN_LIMIT{Re-plan loop count within 3?}
  REPLAN_LIMIT -->|no| FAIL_REPLAN([FAIL: re-plan loop limit reached])
  REPLAN_LIMIT -->|yes| SET_STAGE[Set next required selected-task stage]

  SET_PREP --> DISPATCH_PREP[Dispatch execution-prepper with playbook, invocation mode, and bundled-path defaults]
  SET_STAGE --> ROUTE_STAGE{Current stage}
  ROUTE_STAGE -->|brief| DISPATCH_PREP
  ROUTE_STAGE -->|plan| CHECK_BRIEF
  ROUTE_STAGE -->|tests| CHECK_PLAN
  ROUTE_STAGE -->|refactor| CHECK_TEST_SPEC

  CHECK_BRIEF{Selected-task brief exists and identity matches?} -->|no| BLOCKED_BRIEF([BLOCKED: missing or mismatched brief])
  CHECK_BRIEF -->|yes| DISPATCH_PLAN[Dispatch execution-planner]

  CHECK_PLAN{Brief and plan exist with same selected-task identity?} -->|no| BLOCKED_PLAN([BLOCKED: missing or mismatched planner input])
  CHECK_PLAN -->|yes| DISPATCH_TESTS[Dispatch test-strategist]

  CHECK_TEST_SPEC{Brief, plan, and test spec share selected-task identity?} -->|no| BLOCKED_TEST_SPEC([BLOCKED: missing or mismatched refactoring input])
  CHECK_TEST_SPEC -->|yes| DISPATCH_REFACTOR[Dispatch refactoring-advisor]

  DISPATCH_PREP --> STATUS{Structured subagent status}
  DISPATCH_PLAN --> STATUS
  DISPATCH_TESTS --> STATUS
  DISPATCH_REFACTOR --> STATUS

  STATUS -->|PASS| PASS_CONSISTENT{Readiness fields consistent with PASS?}
  STATUS -->|FAIL| FAIL_STAGE([FAIL: unresolved readiness or planning issue])
  STATUS -->|BLOCKED| BLOCKED_STAGE([BLOCKED: missing prerequisite or artifact])
  STATUS -->|ERROR or malformed| ERROR_STAGE([ERROR: report unexpected failure and stop])

  PASS_CONSISTENT -->|no| ERROR_STAGE
  PASS_CONSISTENT -->|yes| VALIDATE_OUTPUT{Owned artifact exists and satisfies contract?}
  VALIDATE_OUTPUT -->|yes| RECORD_SUMMARY[Retain status, path, verdict, URLs, and concise notes]
  VALIDATE_OUTPUT -->|no| IDENTIFY_OWNER[Identify artifact owner and narrow REPAIR_FINDINGS]
  IDENTIFY_OWNER --> REPAIR_LIMIT{Repair attempts for this stage below 3?}
  REPAIR_LIMIT -->|yes| REDISPATCH_OWNER[Re-dispatch only the owner within selected-task limits]
  REPAIR_LIMIT -->|no| ERROR_REPAIR([ERROR: artifact repair cap reached])
  REDISPATCH_OWNER --> STATUS

  RECORD_SUMMARY --> MORE_STAGES{More stages for this selected task?}
  MORE_STAGES -->|yes| SET_STAGE
  MORE_STAGES -->|no| FINAL_ARTIFACTS{All four selected-task artifacts valid?}
  FINAL_ARTIFACTS -->|no| IDENTIFY_OWNER
  FINAL_ARTIFACTS -->|yes| REPORT[Report paths, approach, tests, refactoring verdict, and references]
  REPORT --> STOP_BOUNDARY[Enforce one-task boundary]
  STOP_BOUNDARY --> COMPLETE([Planning complete; return to caller without advancing])

  class REQUIRED_INPUTS,REPLAN_CHECK,REPLAN_LIMIT,ROUTE_STAGE,CHECK_BRIEF,CHECK_PLAN,CHECK_TEST_SPEC,STATUS,PASS_CONSISTENT,VALIDATE_OUTPUT,REPAIR_LIMIT,MORE_STAGES,FINAL_ARTIFACTS decision;
  class DETECT,INTAKE,SET_LIMITS,INVALIDATE,SET_PREP,SET_STAGE,DISPATCH_PREP,DISPATCH_PLAN,DISPATCH_TESTS,DISPATCH_REFACTOR,RECORD_SUMMARY,IDENTIFY_OWNER,REDISPATCH_OWNER,STOP_BOUNDARY check;
  class REPORT output;
  class COMPLETE success;
  class FAIL_INPUTS,BLOCKED_INPUTS,BLOCKED_BRIEF,BLOCKED_PLAN,BLOCKED_TEST_SPEC,BLOCKED_STAGE,FAIL_REPLAN,FAIL_STAGE,ERROR_STAGE,ERROR_REPAIR stop;

  classDef check fill:#e7f1ff,stroke:#0b5ed7,color:#000;
  classDef decision fill:#f8f9fa,stroke:#495057,color:#000;
  classDef output fill:#e8f5e9,stroke:#2e7d32,color:#000;
  classDef success fill:#e8f5e9,stroke:#2e7d32,color:#000;
  classDef stop fill:#fdecea,stroke:#b02a37,color:#000;
```

Completion requires four valid artifacts for the original `<KEY>` and `TASK_NUMBER`, with every owner returning `PASS`. Every other terminal reports `BLOCKED`, `FAIL`, or `ERROR` without modifying product code, git, another task, or the platform.
