# Preflight Checker - Dependency Manifest

> This file contains the dependency-class structure for the workflow preflight checker. Preflight reports availability only; it does not install, connect, or repair dependencies.
>
> For current platform transport setup or runtime skill-installation details, load `../references/external-sources.md` and fetch one URL from the relevant setup section only when the user needs setup help.

## Classification

This manifest covers dependencies owned directly by the orchestrating workflow: co-located subagents, named runtime downstream skills, and the platform transport needed for work-item reads and writes. Downstream skills own their own transitive skill or tool dependencies and should validate them when invoked.

Skill dependencies are checked by runtime skill discovery or invocation registry. This standalone package carries the full dependency manifest shape inside this folder; the per-phase downstream skill names and the platform transport check command(s) come from the active playbook.

Any requested required dependency confirmed as `MISSING` produces `PREFLIGHT: FAIL`. A required downstream skill that cannot be verified by the host runtime also produces `PREFLIGHT: FAIL` with the dependency listed under `Unknown`. Use `ERROR` only when preflight itself cannot run.

## Dependency Classes by Phase

For each phase the preflight checker validates the following dependency classes. The active playbook supplies the concrete names and check commands.

| Phase | Dependency class | Source of concrete value |
| --- | --- | --- |
| 1 | Platform transport | Active playbook's `Transport` and `Preflight Transport Check` |
| 1 | Phase 1 downstream skill | Active playbook's `Phase Skill Map` row for Phase 1 |
| 2 | Phase 2 downstream skill | Active playbook's `Phase Skill Map` row for Phase 2 |
| 3 | `clarifying-assumptions` | Constant across platforms |
| 4 | Platform transport | Active playbook's `Transport` and `Preflight Transport Check` |
| 4 | Phase 4 downstream skill | Active playbook's `Phase Skill Map` row for Phase 4 |
| 5 | Phase 5 downstream skill | Active playbook's `Phase Skill Map` row for Phase 5 |
| 6 | `clarifying-assumptions` | Constant across platforms |
| 7 | Platform transport (when the playbook lists it for Phase 7) | Active playbook's `Transport` and `Preflight Transport Check` |
| 7 | Phase 7 downstream skill | Active playbook's `Phase Skill Map` row for Phase 7 |

## How to Check Each Class

| Dependency class | Type | How to verify | Configure |
| --- | --- | --- | --- |
| Platform transport | Tool / MCP / CLI | Run the active playbook's `Preflight Transport Check` command(s) | Follow the playbook's `External-Source Routing` setup section |
| Downstream phase skill | Skill | Runtime reports skill available / invokable | Install or enable the named downstream skill |
| `clarifying-assumptions` | Skill | Runtime reports skill available / invokable | Install or enable the skill |

## Quick Reference

Deduplicate repeated dependencies (for example `clarifying-assumptions` across Phases 3 and 6, and platform transport across Phases 1, 4, and potentially 7) when reporting `Available`, `Missing`, and `Unknown` counts.

The active playbook's `Phase Skill Map` is the source of truth for the per-phase downstream skill names listed in any user-facing `Missing:` or `Unknown:` lines.
