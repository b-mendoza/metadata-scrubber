# Final User Report Template

Read only when the pipeline has stopped or completed. The outer schema is platform-neutral. Fill tracker reference and action values from the active playbook.

## Template

```text
## Final Task Report

### Status
<ONE OF: "COMPLETE" | "BLOCKED" | "STOPPED_FOR_USER_INPUT" | "ESCALATED">

### Task
- Work item: `<KEY>`
- Platform: <jira | github>
- Task: `<N>` - <title>

### Summary
<2-3 sentences>

### Evidence Checked
- Kickoff: <status>
- Execution: <status>
- Documentation/tracking: <status>
- Requirements verification: <verdict>
- Clean code review: <verdict>
- Architecture review: <verdict>
- Security audit: <verdict>
- Final tracker completion: <status or `Not attempted`>

### Retry Counts
- Requirements fixes: <0-3>
- Clean-code fixes: <0-3>
- Architecture fixes: <0-3>
- Security fixes: <0-3>

### Implementation Artifacts
- <Category B path>
(or `None`)

### Category A Tracking
- <docs/<KEY>*.md path and update summary>
(or `None`)

### Tracker Updates
- Primary reference: <playbook-defined value or `None`>
- Startup actions: <playbook-defined action summary or `None`>
- Completion actions: <playbook-defined action summary or `None`>
- Skips: <reason or `None`>

### Blockers or Unresolved Items
- <issue or `None`>

### Next Required Action
- <action or `None`>
```

Use `COMPLETE` only after implementation, documentation/tracking, requirements, all quality gates, and final tracker completion or explicit optional skip have passed. Use `BLOCKED` for missing prerequisites or mandatory capabilities, `STOPPED_FOR_USER_INPUT` when a decision is the next safe step, and `ESCALATED` when a retry budget is exhausted or recovery is unsafe.

Always report all four counters, including `0` for a gate that never entered a fix cycle. Preserve passed-phase evidence and counters on stopped or escalated runs. Report only the selected task; do not continue to another task.
