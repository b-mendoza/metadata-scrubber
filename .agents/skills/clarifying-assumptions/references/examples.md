# Clarifying Assumptions Examples

> Read this file only when you need a dispatch round-trip example or a failure trace. Do not load examples during normal execution.

## Upfront Mode Round Trip

Input: `TICKET_KEY=JNS-6065`, `MODE=upfront`, `ITERATION=1`

1. Read `./design-thinking-mindset.md` and `./upfront-mode.md`.
2. Dispatch `critique-analyzer` with the plan file, stage artifacts, `docs/JNS-6065-upfront-critique.md`, plus `docs/JNS-6065-tasks.md` as `PRIOR_DECISIONS_FILE` and `PRIOR_DECISIONS_KIND=main-log`.
3. Receive:

```text
CRITIQUE: PASS
Ticket: JNS-6065 | Mode: upfront | Task: -
Artifact: docs/JNS-6065-upfront-critique.md

## Critique Summary

- Problem-framing items: 2
- Technology critique items: 3
- User-impact items: 0
```

4. Dispatch `question-manifest-builder` with `docs/JNS-6065-upfront-critique.md` and `docs/JNS-6065-tasks.md`.
5. Receive:

```text
MANIFEST: PASS
Ticket: JNS-6065 | Mode: upfront | Task: -
Task title: -
Questions now: 3 | Deferred: 2 | Irrelevant: 1

## Manifest Summary

- Not surfaced: 3 lower-severity items retained in the critique artifact
```

6. Read `./conversation-protocol.md`, walk the 3 questions one at a time, then dispatch `decision-recorder` with the resolved decisions and deferred items.
7. Receive `RECORDING: PASS` plus the file update counts.
8. Present the final summary:

```text
- Critique artifact: docs/JNS-6065-upfront-critique.md
- Files updated: docs/JNS-6065-tasks.md
- RE_PLAN_NEEDED: true
- BLOCKERS_PRESENT: false
- Accepted decisions summary: PF1 revised end-user framing; TC1 kept current approach with constraint
```

## Critique Mode Blocked Round Trip

Input: `TICKET_KEY=acme-app-42`, `MODE=critique`, `TASK_NUMBER=3`, `ITERATION=2`

1. Read `./design-thinking-mindset.md` and `./critique-mode.md`.
2. Dispatch `critique-analyzer` with the task artifacts, `docs/acme-app-42-task-3-critique.md`, plus `docs/acme-app-42-task-3-decisions.md` as `PRIOR_DECISIONS_FILE` and `PRIOR_DECISIONS_KIND=per-task`.
3. Receive:

```text
CRITIQUE: PASS
Ticket: acme-app-42 | Mode: critique | Task: 3
Artifact: docs/acme-app-42-task-3-critique.md
```

4. Dispatch `question-manifest-builder` with the critique report, main task plan, and `CURRENT_TASK_ARTIFACTS`.
5. Receive:

```text
MANIFEST: BLOCKED
Reason: docs/acme-app-42-task-3-test-spec.md is missing
```

6. Stop clarification and present:

```text
- Critique artifact: docs/acme-app-42-task-3-critique.md
- Files updated: -
- RE_PLAN_NEEDED: false
- BLOCKERS_PRESENT: true
- Blocking verdict: MANIFEST: BLOCKED
- Reason: docs/acme-app-42-task-3-test-spec.md is missing
- Decisions file: -
```

`RE_PLAN_NEEDED` stays `false` here because the run blocked before the developer answered anything, so no plan revision was requested. See the Flag Transitions table in `../SKILL.md`.
