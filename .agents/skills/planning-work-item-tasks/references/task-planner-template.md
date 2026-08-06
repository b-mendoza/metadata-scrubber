# Task Planner Template

Read this file only when assembling Stage 1. Keep every heading even when content is sparse; explain gaps instead of removing sections. Resolve every angle-bracket platform token from `PLAYBOOK_PATH`.

```markdown
# <KEY> - Detailed Task Plan

> Source: docs/<KEY>.md Generated on: <YYYY-MM-DD HH:MM UTC>

<SUMMARY_HEADING>

<3-5 sentence summary of the <WORK_ITEM_NOUN> goal, scope, and key constraints.>

## Problem Framing

### End User

<Who the end user is. If the <WORK_ITEM_NOUN> does not state this, write: "Not stated in <WORK_ITEM_NOUN> - requires developer input.">

### Underlying Need

<The user problem or need this <WORK_ITEM_NOUN> addresses. Mark inferred content clearly.>

### Proposed Solution

<The solution the <WORK_ITEM_NOUN> prescribes.>

### Solution-Problem Fit

<How directly the proposed solution addresses the underlying need; include gaps and assumptions.>

### Alternative Approaches Not Explored

<Other ways the underlying need could be met. "None identified" is acceptable for tightly scoped fixes.>

### Evidence Basis

<Evidence cited for the solution. If none, write: "Not stated in <WORK_ITEM_NOUN> - requires developer input.">

## Assumptions and Constraints

1. <Assumption or constraint.>
2. <Assumption or constraint.>

## Cross-Cutting Open Questions

1. **<Question>** - <Why it matters and fallback if unanswered.>

## Tasks

### Task A: <Short descriptive title>

**Objective:** <One to two sentences on what this task accomplishes.>

**Relevant requirements and context:** <Only the requirements, constraints, and background needed for this task.>

- Traces to: <Specific description, acceptance criteria, comment, <CHILD_ITEM_NOUN>, or linked issue source.>

**Questions to answer before starting:** <Uncertainties, why they matter, and fallback if unanswered. If none, write `None`.>

**Implementation notes:** <Expected approach, boundaries, and technical considerations. If the codebase is unknown, describe what to look for.>

**Definition of done:**

- [ ] <Concrete verifiable outcome.>

**Likely files / artifacts affected:** <Files, modules, or systems. If unknown, write `Unknown - requires codebase exploration`.>

### Task B: <Short descriptive title>

...

## Notes

<Plan observations, ambiguity, task-count exceptions, existing <CHILD_ITEM_NOUN> mapping, or current-item scope note.>
```
