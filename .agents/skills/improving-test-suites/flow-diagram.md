# Improving Test Suites Flow Diagram

This diagram visualizes the workflow. The single normative routing source is
[`references/orchestration-protocol.md`](./references/orchestration-protocol.md).

```mermaid
flowchart TD
  START([Start]) --> RESOLVE[Expand TARGET_TEST_FILES]
  RESOLVE --> TARGET_OK{At least one existing test file?}
  TARGET_OK -->|no| ASK_TARGET[Ask focused target question]
  ASK_TARGET -->|answered| RESOLVE
  ASK_TARGET -->|no answer| FINAL_BLOCKED
  TARGET_OK -->|yes| WORKSPACE{Workspace risk?}
  WORKSPACE -->|yes| ASK_WORKSPACE[Ask to proceed]
  ASK_WORKSPACE -->|approved| LOAD_PROTOCOL
  ASK_WORKSPACE -->|declined or no answer| FINAL_BLOCKED
  WORKSPACE -->|no| LOAD_PROTOCOL[Load orchestration protocol]

  LOAD_PROTOCOL --> VALUE[Dispatch test-value-reviewer]
  VALUE --> VALUE_STATUS{VALUE_STATUS}
  VALUE_STATUS -->|PASS| VALUE_REPORT[Record value report]
  VALUE_STATUS -->|BLOCKED or NEEDS_CLARIFICATION| ASK_VALUE[Ask value question]
  VALUE_STATUS -->|ERROR| FINAL_ERROR
  ASK_VALUE -->|answered| VALUE
  ASK_VALUE -->|no answer| FINAL_BLOCKED

  VALUE_REPORT --> API_ROUTE{API review route?}
  API_ROUTE -->|required or optional| API[Dispatch api-security-reviewer]
  API_ROUTE -->|not needed| MAINT_ROUTE
  API --> API_STATUS{API_STATUS}
  API_STATUS -->|PASS or NOT_APPLICABLE| MAINT_ROUTE
  API_STATUS -->|BLOCKED or NEEDS_CLARIFICATION or ERROR| API_CHECK{Required or checklist fails?}
  API_CHECK -->|yes| ASK_API[Ask API/security question]
  API_CHECK -->|no| API_RISK[Record remaining risk]
  ASK_API -->|answered| API
  ASK_API -->|no answer| FINAL_BLOCKED
  API_RISK --> MAINT_ROUTE

  MAINT_ROUTE{Maintainability route?}
  MAINT_ROUTE -->|required or optional| MAINT[Dispatch test-maintainability-reviewer]
  MAINT_ROUTE -->|not needed| SYNTH
  MAINT --> MAINT_STATUS{MAINT_STATUS}
  MAINT_STATUS -->|PASS| SYNTH
  MAINT_STATUS -->|BLOCKED or NEEDS_CLARIFICATION or ERROR| MAINT_CHECK{Required or checklist fails?}
  MAINT_CHECK -->|yes| ASK_MAINT[Ask maintainability question]
  MAINT_CHECK -->|no| MAINT_RISK[Record remaining risk]
  ASK_MAINT -->|answered| MAINT
  ASK_MAINT -->|no answer| FINAL_BLOCKED
  MAINT_RISK --> SYNTH

  SYNTH[Synthesize itemized minimal harness decision] --> SAFE_EDIT{Safe edit justified?}
  SAFE_EDIT -->|no| VALIDATE_NOOP[Validate with CHANGED_FILES=none]
  SAFE_EDIT -->|yes| DUAL{Production or non-additive shared helper?}
  DUAL -->|yes| ASK_DUAL[Ask dual authority naming files]
  DUAL -->|no| PLAN_GATE
  ASK_DUAL -->|approved and scope permits| PLAN_GATE
  ASK_DUAL -->|declined bug driver| FINAL_BUG
  ASK_DUAL -->|declined otherwise| REPLAN[Remove unapproved items]
  ASK_DUAL -->|no answer| FINAL_BLOCKED
  REPLAN --> PLAN_GATE
  PLAN_GATE{AUTO_APPROVE?}
  PLAN_GATE -->|yes| REFACTOR[Dispatch test-refactorer]
  PLAN_GATE -->|no| ASK_PLAN[Ask approval for itemized plan]
  ASK_PLAN -->|approved or amended| REFACTOR
  ASK_PLAN -->|declined| FINAL_NO_CHANGE
  ASK_PLAN -->|no answer| FINAL_BLOCKED

  REFACTOR --> REFACTOR_STATUS{REFACTOR_STATUS}
  REFACTOR_STATUS -->|PASS| CONFORM{Conformance passes?}
  REFACTOR_STATUS -->|BLOCKED or NEEDS_CLARIFICATION| ASK_REFACTOR[Ask refactor question]
  REFACTOR_STATUS -->|FAIL bug outside scope| FINAL_BUG
  REFACTOR_STATUS -->|FAIL other| FINAL_BLOCKED
  REFACTOR_STATUS -->|ERROR| ERROR_GATE{Active repair and budget left?}
  ASK_REFACTOR -->|answered| REFACTOR
  ASK_REFACTOR -->|no answer| FINAL_BLOCKED
  ERROR_GATE -->|yes| INC_ERROR[Increment REPAIR_TOTAL and retry]
  ERROR_GATE -->|no| FINAL_ERROR
  INC_ERROR --> REFACTOR

  CONFORM -->|yes| VALIDATE_CHANGED[Dispatch test-validator]
  CONFORM -->|repairable mismatch| BUDGET
  CONFORM -->|needs user decision| ASK_CONFORM[Ask conformance question]
  ASK_CONFORM -->|answered| SYNTH
  ASK_CONFORM -->|no answer| FINAL_BLOCKED
  VALIDATE_NOOP --> VALIDATION_STATUS
  VALIDATE_CHANGED --> VALIDATION_STATUS
  VALIDATION_STATUS{VALIDATION_STATUS}
  VALIDATION_STATUS -->|PASS changed| FINAL_CHANGED
  VALIDATION_STATUS -->|PASS no changes| FINAL_NO_CHANGE
  VALIDATION_STATUS -->|BLOCKED| ASK_VALIDATION[Ask validation question]
  VALIDATION_STATUS -->|ERROR| FINAL_ERROR
  VALIDATION_STATUS -->|FAIL no changes and production bug| FINAL_BUG
  VALIDATION_STATUS -->|FAIL no changes otherwise| FINAL_NO_CHANGE
  VALIDATION_STATUS -->|FAIL changed| LOAD_REPAIR[Load repair protocol]
  ASK_VALIDATION -->|answered| VALIDATE_CHANGED
  ASK_VALIDATION -->|no answer| FINAL_BLOCKED

  LOAD_REPAIR --> CAUSE{Likely cause?}
  CAUSE -->|test refactor regression| BUDGET{REPAIR_TOTAL under 3?}
  CAUSE -->|production bug exposed| ASK_DUAL_REPAIR[Ask production fix authority]
  CAUSE -->|pre-existing failure| FINAL_FAILED
  CAUSE -->|unknown retry plausible| BUDGET
  CAUSE -->|unknown no retry| FINAL_FAILED
  ASK_DUAL_REPAIR -->|approved| BUDGET
  ASK_DUAL_REPAIR -->|declined| FINAL_BUG
  ASK_DUAL_REPAIR -->|no answer| FINAL_BLOCKED
  BUDGET -->|yes| INC[Increment and build full repair packet]
  BUDGET -->|no| FINAL_FAILED
  INC --> REPAIR_KIND{Repair kind?}
  REPAIR_KIND -->|test edit| REFACTOR
  REPAIR_KIND -->|validation retry| VALIDATE_CHANGED

  FINAL_CHANGED[CHANGED_PASS]
  FINAL_NO_CHANGE[COMPLETE_NO_SAFE_CHANGE]
  FINAL_BUG[COMPLETE_PRODUCTION_BUG_EXPOSED]
  FINAL_FAILED[VALIDATION_FAILED_AFTER_REPAIR]
  FINAL_ERROR[COMPLETE_ERROR]
  FINAL_BLOCKED[COMPLETE_BLOCKED with resume packet]
```
