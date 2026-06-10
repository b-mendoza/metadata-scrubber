# Orchestration Protocol

> Read this file after intake. Dispatch raw file inspection, web fetches,
> edits, and command runs to subagents; keep the orchestrator on routing
> decisions and compact summaries.

Bundled paths named in this file are relative to this file. Dispatch packet
values passed to subagents use the receiving subagent's input-contract paths and
must resolve inside this skill package.

## Dispatch Packet

Build and pass only these fields unless the user supplied additional relevant
scope:

| Field | Include when | Notes |
| ----- | ------------ | ----- |
| `TARGET_TEST_FILES` | Always | Path, directory, glob, or explicit list |
| `USER_GOAL` | Supplied or inferable | Keep short and user-facing |
| `TEST_COMMAND` | Supplied or obvious | Prefer the narrow target command |
| `SCOPE_LIMITS` | Supplied or important | Example: `test files only` |
| `REFERENCE_NEED` | User named a topic | Example: `pytest parametrization` |
| `EXTERNAL_SOURCES_PATH` | Only when source-backed support is requested or needed | `../references/external-sources.md` |
| `HEURISTICS_PATH` | Review subagents and synthesis | `../references/test-quality-heuristics.md` |
| `REPORT_TEMPLATE_PATH` | Every subagent | The template that matches that subagent |

External source use is owned by the relevant subagent dispatch. Use
`../references/external-sources.md` or a user-supplied official documentation URL;
ask before unsupported external source use.

## Flow Entity Crosswalk

The flow diagram uses these decision names for deterministic routing:

| Decision | Meaning |
| -------- | ------- |
| `HAS_TARGET` | `TARGET_TEST_FILES` is present or safely inferable |
| `VALUE_STATUS` | Immediate route for `TEST_VALUE_REVIEW` |
| `API_ROUTE` | Required, optional, or not-needed API/security review route |
| `API_STATUS` | Immediate route for `API_SECURITY_REVIEW` |
| `API_REQUIRED_GATE` | Whether an API/security blocker must stop the workflow |
| `API_ERROR_GATE` | Whether an API/security error must stop the workflow |
| `MAINT_ROUTE` | Required, optional, or not-needed maintainability review route |
| `MAINT_STATUS` | Immediate route for `MAINTAINABILITY_REVIEW` |
| `MAINT_REQUIRED_GATE` | Whether a maintainability blocker must stop the workflow |
| `MAINT_ERROR_GATE` | Whether a maintainability error must stop the workflow |
| `SAFE_EDIT` | A safe test or helper edit is justified |
| `MUTATION_SCOPE` | The edit stays within tests and directly related helpers |
| `PROD_APPROVAL` | User explicitly approves a production-code fix |
| `REFACTOR_STATUS` | Immediate route for `TEST_REFACTOR` |
| `REFACTOR_FAIL_KIND` | Whether `TEST_REFACTOR: FAIL` exposes a production bug outside scope |
| `VALIDATION_STATUS` | Immediate route for `TEST_VALIDATION` |
| `HANDOFF_CONTEXT` | Validation passed with changed files or no changed files |
| `VALIDATION_FAIL_CONTEXT` | Validation failed with changed files or no changed files |
| `VALIDATION_CAUSE` | Validator likely-cause classification for changed-file failures |
| `REPAIR_COUNT` | Targeted repair cycle count is still under three |

## Phase Routing

### 1. Test Value Review

Dispatch `test-value-reviewer` with the dispatch packet, `HEURISTICS_PATH`, and
`REPORT_TEMPLATE_PATH=../references/test-value-review-template.md`. Include
`EXTERNAL_SOURCES_PATH=../references/external-sources.md` only when the user
requested a source-backed decision or the reviewer reaches a concrete source
need.

Route `VALUE_STATUS` immediately:

| `TEST_VALUE_REVIEW` status | Orchestrator action |
| -------------------------- | ------------------- |
| `PASS` | Record suite diagnosis, protected behaviors, low-value gaps, review routes, fetched URLs, blockers, reason, and decision needed |
| `BLOCKED` | Ask or report the required value-review blocker, then hand off as `COMPLETE_BLOCKED` |
| `NEEDS_CLARIFICATION` | Ask one focused value or scope decision, then hand off as `COMPLETE_BLOCKED` |
| `ERROR` | Hand off as `COMPLETE_ERROR` with completed work and recovery context |

### 2. API/Security Route

Set `API_ROUTE` from the value review and visible target/goal signals:

| Route | When |
| ----- | ---- |
| `required` | Value review marks `API_SECURITY_REVIEW: required`, or the goal/target clearly concerns APIs, tools, schemas, auth, permissions, unsafe inputs, filesystem paths, network calls, or security behavior |
| `optional` | API/security risk is plausible but value evidence is already enough for a safe harness decision |
| `not needed` | No API/security-sensitive surface is present |

For `required` or `optional`, dispatch `api-security-reviewer` with the original
dispatch packet, prior compact reports, `HEURISTICS_PATH`, and
`REPORT_TEMPLATE_PATH=../references/api-security-review-template.md`.

Route `API_STATUS` immediately:

| `API_SECURITY_REVIEW` status | Required route or value evidence insufficient | Optional route with sufficient value evidence |
| ---------------------------- | --------------------------------------------- | ------------------------------------------- |
| `PASS` | Record report and fetched URLs | Record report and fetched URLs |
| `NOT_APPLICABLE` | Record `API_SECURITY_REVIEW: NOT_APPLICABLE` and continue | Record `API_SECURITY_REVIEW: NOT_APPLICABLE` and continue |
| `BLOCKED` | Ask one focused API/security decision, prerequisite, or unsupported-source approval, then hand off as `COMPLETE_BLOCKED` | Record skipped optional API/security review as remaining risk |
| `NEEDS_CLARIFICATION` | Ask one focused API/security decision, prerequisite, or unsupported-source approval, then hand off as `COMPLETE_BLOCKED` | Record skipped optional API/security review as remaining risk |
| `ERROR` | Hand off as `COMPLETE_ERROR` | Record skipped optional API/security review as remaining risk |

### 3. Maintainability Route

Set `MAINT_ROUTE` from the value review and visible target/goal signals:

| Route | When |
| ----- | ---- |
| `required` | Value review marks `MAINTAINABILITY_REVIEW: required`, or readability/fixture/mocking problems are central to the user goal |
| `optional` | Maintainability work may help, but value evidence is already enough for a safe harness decision |
| `not needed` | The target is already small, clear, and not fixture-heavy, mock-heavy, duplicated, hard to scan, or framework-specific |

For `required` or `optional`, dispatch `test-maintainability-reviewer` with the
original dispatch packet, prior compact reports, `HEURISTICS_PATH`, and
`REPORT_TEMPLATE_PATH=../references/test-maintainability-review-template.md`.

Route `MAINT_STATUS` immediately:

| `MAINTAINABILITY_REVIEW` status | Required route or value evidence insufficient | Optional route with sufficient value evidence |
| ------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `PASS` | Record report and fetched URLs | Record report and fetched URLs |
| `BLOCKED` | Ask one focused maintainability decision, prerequisite, or unsupported-source approval, then hand off as `COMPLETE_BLOCKED` | Record skipped optional maintainability review as remaining risk |
| `NEEDS_CLARIFICATION` | Ask one focused maintainability decision, prerequisite, or unsupported-source approval, then hand off as `COMPLETE_BLOCKED` | Record skipped optional maintainability review as remaining risk |
| `ERROR` | Hand off as `COMPLETE_ERROR` | Record skipped optional maintainability review as remaining risk |

### 4. Minimal Harness Decision

Synthesize `MINIMAL_HARNESS_DECISION` using compact reports, optional-review
risks, fetched URLs, and the priorities and rules in
`./test-quality-heuristics.md`. Include:

- Tests or areas to delete, rewrite, consolidate, keep, and add
- Public behavior contracts and failure modes to preserve
- Scope boundaries, especially production-code edit permissions
- References fetched that materially influenced decisions
- Preferred validation command, when known

When no safe test or helper edit is justified, record the no-op rationale,
scope limits, optional-review risks, and fetched URLs, then validate with
`CHANGED_FILES=none`.

### 5. Refactor

When a safe edit is justified and stays within tests or directly related test
helpers, dispatch `test-refactorer` with the original dispatch packet,
`MINIMAL_HARNESS_DECISION`, concise review reports, any validation failure
summary from a repair cycle, and
`REPORT_TEMPLATE_PATH=../references/test-refactor-template.md`.

Ask before production-code fixes. The approval request includes target, reason,
risk, reversibility, and safer alternative. If the user declines, hand off as
`COMPLETE_PRODUCTION_BUG_EXPOSED`.

Route `REFACTOR_STATUS` immediately:

| `TEST_REFACTOR` status | Orchestrator action |
| ---------------------- | ------------------- |
| `PASS` | Record changed files, skipped edits, production changes, risks, assumptions, and suggested validation command |
| `BLOCKED` | Ask or report the required refactor blocker, then hand off as `COMPLETE_BLOCKED` |
| `NEEDS_CLARIFICATION` | Ask one focused refactor scope or contract decision, then hand off as `COMPLETE_BLOCKED` |
| `FAIL` | If a production bug is exposed outside approved scope, hand off as `COMPLETE_PRODUCTION_BUG_EXPOSED`; otherwise hand off as `COMPLETE_BLOCKED` |
| `ERROR` | Hand off as `COMPLETE_ERROR` with completed work and recovery context |

### 6. Validate

Dispatch `test-validator` after either a refactor or a no-op decision:

- Changed path: include target files, changed files, suggested validation
  command, supplied `TEST_COMMAND`, scope limits, and
  `REPORT_TEMPLATE_PATH=../references/test-validation-template.md`.
- No-op path: include target files, `CHANGED_FILES=none`, any supplied or
  inferred command, scope limits, and
  `REPORT_TEMPLATE_PATH=../references/test-validation-template.md`.

Let `test-validator` choose the narrowest command from supplied, suggested, or
inferable repository conventions. Ask the user only when `TEST_VALIDATION:
BLOCKED` returns the smallest command, dependency, template, or permission
question.

Route `VALIDATION_STATUS` immediately:

| `TEST_VALIDATION` status | Changed files | No changed files |
| ------------------------ | ------------- | ---------------- |
| `PASS` | Hand off as `CHANGED_PASS` | Hand off as `COMPLETE_NO_SAFE_CHANGE` |
| `FAIL` | Load `./repair-protocol.md` and route by likely cause | Hand off as `COMPLETE_NO_SAFE_CHANGE` with validation limitation or failure risk |
| `BLOCKED` | Ask the validator's smallest question, then hand off as `COMPLETE_BLOCKED` | Ask the validator's smallest question, then hand off as `COMPLETE_BLOCKED` |
| `ERROR` | Hand off as `COMPLETE_ERROR` | Hand off as `COMPLETE_ERROR` |

## Repair Routing

When changed-file validation returns `FAIL`, initialize `REPAIR_COUNT=0` if no
repair count exists for the current validation failure, load
`./repair-protocol.md`, and use the validator's likely cause:

| Likely cause | Action |
| ------------ | ------ |
| `test refactor regression` | If `REPAIR_COUNT` is under three, increment it, redispatch `test-refactorer` with `VALIDATION_FAILURE` and a bounded repair packet, then rerun `test-validator` |
| `production bug exposed` | Ask before production-code fixes unless already approved; if declined or outside scope, hand off as `COMPLETE_PRODUCTION_BUG_EXPOSED` |
| `pre-existing failure` | Hand off as `VALIDATION_FAILED_AFTER_REPAIR` with failure summary and risk |
| `unknown` | Follow `./repair-protocol.md`; if a command or environment retry is plausible and `REPAIR_COUNT` is under three, increment it and retry the failing validation once; otherwise hand off as `VALIDATION_FAILED_AFTER_REPAIR` |

A repair cycle is one targeted repair attempt plus the validation rerun that
follows it. Increment `REPAIR_COUNT` immediately before redispatching a repair
subagent or retrying validation. Do not increment for loading the repair
protocol, asking for approval, recording a blocker, or writing the final handoff.
Do not reset the count after a validation rerun; if validation fails again, keep
the current count and evaluate it before the next repair dispatch. Stop when
`REPAIR_COUNT` is three before another targeted repair attempt.

## Handoff

Before the user-visible final response, load
`./final-handoff-template.md` and choose exactly one handoff status:

| Handoff status | Use when |
| -------------- | -------- |
| `CHANGED_PASS` | Approved test changes were applied and validation passed |
| `COMPLETE_NO_SAFE_CHANGE` | No safe edit was justified, or no-op validation did not require mutation |
| `COMPLETE_PRODUCTION_BUG_EXPOSED` | A high-signal test exposed a production bug outside approved edit scope |
| `VALIDATION_FAILED_AFTER_REPAIR` | Changed-file validation failed after bounded repair handling |
| `COMPLETE_ERROR` | A subagent or validation error prevents reliable continuation |
| `COMPLETE_BLOCKED` | A missing target, prerequisite, command, approval, or decision blocks continuation |

Every handoff records changed files or no-op rationale, validation status,
fetched URLs, risks, scope limits, and any user approvals or blocked decisions.
