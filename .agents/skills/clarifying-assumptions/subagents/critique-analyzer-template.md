# Critique Analyzer — Output Template

When writing `CRITIQUE_REPORT_FILE`, do not copy this title or the instruction lines into the artifact. The written file must start with:

```text
CRITIQUE: <PASS|WARN>
Ticket: <KEY> | Mode: <upfront|critique> | Task: <N|->
Artifact: <CRITIQUE_REPORT_FILE>
```

Then continue with the body below.

> Downstream skills parse this structure. Keep section names stable.

## Critique Report

### Artifacts Reviewed

- `MAIN_PLAN_FILE`: <path>
- `ARTIFACTS`:
  - <path>

### Codebase Verification

| Check             | Finding                         |
| ----------------- | ------------------------------- |
| Package manager   | <npm/yarn/pnpm/bun>             |
| Runtime           | <node/python/etc.>              |
| Framework         | <actual framework in use>       |
| Test framework    | <actual test framework in use>  |
| Key dependencies  | <top relevant dependencies>     |
| Existing patterns | <patterns observed in the repo> |

### Problem Framing Critique

Include this section only in `MODE=upfront`.

| Item ID | Severity | Dimension | Finding   | Why this matters | Tier   |
| ------- | -------- | --------- | --------- | ---------------- | ------ |
| PF1     | HIGH     | End user  | <finding> | <impact>         | Tier 3 |

#### PF1: <short title>

- Dimension: <End User / Need / Solution-Problem Fit / Evidence Basis / Alternatives>
- Finding: <what is missing or weak>
- Why this matters: <concrete downstream risk>
- What the developer should think about: <specific prompt angle>

### Technology Critique Items

| Item ID | Severity | Decision made | Source artifact | Alternatives | Why this matters |
| --- | --- | --- | --- | --- | --- |
| TC1 | HIGH | <decision> | <artifact> | <named options> | <project-specific consequence> |

#### TC1: <short title>

- Decision: <planner's choice>
- Why this looks questionable: <project-specific reasoning>

| Option        | Pros for this project | Cons for this project |
| ------------- | --------------------- | --------------------- |
| <chosen>      | <pros>                | <cons>                |
| <alternative> | <pros>                | <cons>                |

- What would need to be true for the chosen option to be right: <conditions>
- What would need to be true for the alternative to be better: <conditions>
- Web findings:
  - <source or search result summary>
  - <source or search result summary>
- Evidence conflict: <none, or summarize unresolved contradictory sources that justify HIGH severity>

### User Impact Critique Items

Include this section only in `MODE=critique`.

| Item ID | Severity | Implementation decision | User-facing consequence | Problem-framing link |
| --- | --- | --- | --- | --- |
| UI1 | HIGH | <decision> | <consequence> | <how it affects the identified user and need> |

#### UI1: <short title>

- Implementation decision: <planner's choice>
- User-facing consequence: <concrete impact>
- Problem-framing link: <connection back to the plan's problem framing>
- Severity: <HIGH / MEDIUM / LOW>

### Items Not Raised

- <candidate concern already answered in the Decisions Log or otherwise no longer worth raising>

### Summary

- Problem-framing items: <N>
- Technology critique items: <N>
- User-impact items: <N>
