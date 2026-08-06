# Downstream Skill Dependencies

> Read this file only when entering a phase, validating runtime dependencies, or explaining how to install a missing workflow skill. The dependencies below are invoked by skill name through the host runtime and may be installed outside this package.

This orchestrator is standalone, but the end-to-end workflow still depends on separate phase skills, and the per-phase skill names differ by platform. A downloaded copy of this package should work whenever those named skills are installed and invokable by the host runtime. If they are unavailable, stop at preflight and ask the user to install or enable the missing skill dependency.

For current runtime installation or skill-discovery instructions, load `./external-sources.md` and fetch one URL from the runtime skill docs section.

## Phase Skill Map

The active playbook's `Phase Skill Map` section is the source of truth for per-phase downstream skill names, required inputs, and what to retain from each output. Load the matching playbook before entering a phase:

| Platform | Playbook                                       |
| -------- | ---------------------------------------------- |
| Jira     | [`./jira-playbook.md`](./jira-playbook.md)     |
| GitHub   | [`./github-playbook.md`](./github-playbook.md) |

Phases 3 and 6 always dispatch `clarifying-assumptions` regardless of platform; it accepts `TICKET_KEY` as the workflow-key alias for either identifier.

## Preflight Contract

`preflight-checker` validates only direct dependencies for the remaining phase range. It reads the active playbook's `Phase Skill Map` rows (for downstream skill names) and `Preflight Transport Check` section (for the platform transport check command) when assembling its manifest.

| Dependency class | Source of truth | How to verify |
| --- | --- | --- |
| Platform transport | Active playbook's `Transport` and `Preflight Transport Check` sections | Run the playbook-supplied check command(s) |
| Downstream phase skill | Active playbook's `Phase Skill Map` row for the phase | Runtime skill discovery or invocation registry reports the skill is available |
| `clarifying-assumptions` | This file (constant across platforms) | Runtime skill discovery or invocation registry reports the skill is available |

If the runtime exposes no reliable skill-discovery mechanism for a required skill, return `PREFLIGHT: FAIL`, list the dependency under `Unknown`, and ask the user to install, enable, or confirm the named skill before invoking it.

## Dispatch Example

<example>
Phase 3 dispatch (Jira platform; values per `./jira-playbook.md`):

```text
Skill: clarifying-assumptions
Inputs:
  TICKET_KEY: JNS-6065
  MODE: upfront
  ITERATION: 1
Retain: RE_PLAN_NEEDED, BLOCKERS_PRESENT, accepted decisions summary
```

</example>

<example>
Phase 6 dispatch (GitHub platform; values per `./github-playbook.md`):

```text
Skill: clarifying-assumptions
Inputs:
  TICKET_KEY: acme-app-42        # ISSUE_SLUG value passed under the alias
  MODE: critique
  TASK_NUMBER: 2
  ITERATION: 1
Retain: RE_PLAN_NEEDED, BLOCKERS_PRESENT, decisions file path
```

</example>
