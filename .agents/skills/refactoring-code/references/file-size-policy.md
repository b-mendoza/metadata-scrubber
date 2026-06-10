# File Size Policy

> Read this file only when the strategist or reviewer must justify, plan, or enforce a file split. Keep counted lines, waivers, and chosen patterns in structured handoffs; do not paste raw file contents back to the orchestrator.

`MAX_LINES` defaults to `250` and is the per-file ceiling for any file the refactor produces or modifies. The rule keeps modules cohesive, reviewable, and editor-friendly. A file above the ceiling indicates that the module is doing more than one job or is mixing concerns at different abstraction levels.

This policy measures allowed file changes only. Changes to test intent, such as assertion edits, weakened expectations, fixture updates, or snapshot updates, are outside the behavior-preserving refactor boundary; mechanical test import, path, or name updates required by an approved refactor are allowed and size-checked.

## Counting Policy

- Count physical lines as reported by the host editor or `wc -l`.
- Count blank lines and comments. Excluding them invites token-shaving by removing whitespace or notes.
- Count the file as it sits on disk after the refactor, not the diff size.

## When The Rule Applies

| Case | Apply rule? |
| ---- | ----------- |
| The original target file | Yes |
| New files produced by a split | Yes |
| Files modified as a direct compilation consequence | Yes |
| Files only referenced (no edits) | No |
| Test files modified only for approved mechanical import, path, or name updates | Yes |

## Permitted Waivers

Record any waiver explicitly in `STRATEGY` with the reason. The orchestrator asks for user approval before implementation uses a waiver. Common waivers:

| Waiver | Example |
| ------ | ------- |
| Generated code | OpenAPI, GraphQL, Protobuf outputs |
| Static data | JSON fixtures, lookup tables, snapshot files |
| Single declaration | An auto-generated type or const block where splitting harms clarity |
| Framework-required single file | Migrations or schema files the framework loads as one unit |

Anything else requires either a split or a `NEEDS_CLARIFICATION` from the strategist; do not treat it as an implicit approval to exceed `MAX_LINES`.

## Split Decision Tree

1. **Project architecture first.** Use the existing folder shape (e.g., `domain/`, `application/`, `infrastructure/`, feature folders, layered MVC). Place each extracted file where similar concerns already live.
2. **If no clear architecture exists**, split along these seams in order:
   - Pure decision logic and predicates.
   - Side-effect adapters (I/O, persistence, network, time, randomness, env).
   - Type definitions and contracts.
   - Orchestration that wires the above.
3. **Preserve the public surface.** Keep the original entry point and re-export only what existing callers already use.
4. **Avoid speculative layers.** Do not introduce an interface, factory, or registry just to make the move feel architectural.

## External Support

This policy is enough to decide and report size compliance. When a split seam needs article-backed support, use `./refactoring-web-resources.md` to fetch one matching source for cohesion, single responsibility, domain-shaped folders, Functional Core / Imperative Shell, move mechanics, or wrong abstraction risk.

## Reporting

In `STRATEGY`, include a size plan:

```text
File size plan:
- <path> -> <projected lines> [keep | split]
- New file <path> -> <projected lines> [extracted from <path>]
Waivers: none | <path>: <reason>
```

In `IMPLEMENTATION`, include the actual sizes:

```text
File sizes after change:
- <path>: <lines>
- <path>: <lines>
```

In `REFACTOR_REVIEW`, the size check passes only when every changed or created file is at or below `MAX_LINES`, or every overage has a waiver recorded in `STRATEGY`.
