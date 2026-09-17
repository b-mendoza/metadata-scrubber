# Keep guidance tied to observed failures

Scope: every `AGENTS.md` and `docs/agent/` file in any service.

Why: agents load guidance into context. Each line must change an action.

## Do's
### Add rules for observed failures and place each reference in its layer

Add a rule after an observed failure shows the need. State the required action. Use a standalone prohibition for a repeated failure. Remove obsolete rules that no longer affect an action. Keep a rule whose enforcement still prevents a mistake; agents complying is not a reason to delete it.

Stable, actionable principles and their mandatory correct and incorrect fenced examples live in meaningful domain directories under the shared and service `docs/agent/STEERING/` roots. Each `AGENTS.md` is a brief directory-based entry point that requires task-relevant retrieval, not an exhaustive rule index or command catalog. Keep volatile rosters of source locations in existing reference docs outside `docs/agent/`, not in rule prose or `AGENTS.md`. Update those references with the change that makes them stale. Do not create a new reference or index just to satisfy the layout.

A rule and its examples may use real import specifiers, APIs, and call-site source references. These examples teach the action better than a placeholder. Keep each snippet matching the real source. Update the snippet in the same change as the source it shows.

```md
Hypothetical failure: an agent hand-edited generated output.
Rule: change the source, then regenerate with the owning tool.

Real source used as a context example:
import { createWorkflowHttpClient } from "#/shared/libs/ky/workflow-http-client.mod.server";

Banner for a currently true reference:
Update this reference in the same change when the code or commands it describes change.
```

## Don'ts
### Do not add empty advice or delete a rule because agents comply

```text
Always write clear code.
Agents now regenerate correctly, so delete the rule that tells them to regenerate.
Create a reference file only to satisfy the layout.
```
