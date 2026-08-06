# Execution Kickoff Report Template

Read only when `execution-starter` is ready to return. Use the structure exactly, replace every placeholder, and fill tracker reference/action values from the active playbook. Use `None` for empty sections.

## Template

```text
## Execution Kickoff Report

### Status
<ONE OF: "READY" | "BLOCKED" | "ERROR">

### Task Readiness
- Task exists: Yes | No
- Dependencies complete: Yes | No
- Planning artifacts aligned: Yes | No

### Workspace Readiness
- Branch/worktree state: <ready | adjusted | blocked>
- Target branch: <branch or `None`>
- Branch source: <task section | execution order summary | none | conflict>
- Checkout result: <already on branch | switched | created | blocked | skipped>
- Local changes handling: <clean | isolated | blocked>
- Notes: <summary or `None`>

### Tracker Capability
- Transport: <playbook-defined transport>
- Availability: <available | unavailable | unauthenticated | unauthorized | unsupported>
- Requirement level: <optional | mandatory | not applicable>
- Result: <usable | skipped | blocked> - <detail>

### Tracker Kickoff
- Primary reference: <playbook-defined value>
- Secondary reference: <playbook-defined value or `None`>
- Actions taken: <playbook-defined action values or `none`>
- Result: <done | skipped | blocked> - <detail>

### Next Step
- <usually `Dispatch task-executor` or a specific blocker>

### Blockers or Ambiguities
- <issue or `None`>
```

`READY` is the normal success outcome. An optional unavailable tracker action may be `skipped` while status remains `READY`. `BLOCKED` means the next safe action requires orchestrator or user judgment, including a mandatory unavailable tracker action. `ERROR` means an unexpected failure prevented reliable kickoff.

## Example Success With Optional Skip

```text
## Execution Kickoff Report

### Status
READY

### Task Readiness
- Task exists: Yes
- Dependencies complete: Yes
- Planning artifacts aligned: Yes

### Workspace Readiness
- Branch/worktree state: ready
- Target branch: `feature/work-item-task-3-cache-invalidation`
- Branch source: task section
- Checkout result: already on branch
- Local changes handling: clean
- Notes: None

### Tracker Capability
- Transport: active playbook transport
- Availability: unavailable
- Requirement level: optional
- Result: skipped - local implementation does not require a tracker mutation

### Tracker Kickoff
- Primary reference: None
- Secondary reference: None
- Actions taken: none
- Result: skipped - optional tracker capability unavailable

### Next Step
- Dispatch task-executor

### Blockers or Ambiguities
- None
```

For `BLOCKED`, set affected readiness fields to `blocked` or `No` and name the precise prerequisite, branch, workspace, or mandatory tracker blocker.
