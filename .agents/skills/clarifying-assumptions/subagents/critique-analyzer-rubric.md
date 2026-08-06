# Critique Analyzer Rubric

> Load this file before deciding what to critique. The rubric below is the local execution contract.
>
> **Reminder:** For method background or current technology-landscape context, use `../references/external-sources.md` and fetch one URL.

## Upfront Mode Dimensions

In `MODE=upfront`, look for these categories:

- **Problem framing**
  - End user identification
  - Underlying need
  - Solution-problem fit
  - Evidence basis
  - Alternative approaches
- **Technology and architecture critique**
  - Framework or library choices
  - Architectural defaults
  - Dependency ordering assumptions
  - Scope decisions that hide trade-offs

## Critique Mode Dimensions

In `MODE=critique`, look for these categories:

- **Task-level critique**
  - Framework or library choices
  - Testing strategy
  - Refactoring scope
  - Implementation approach
- **User impact**
  - Latency, data freshness, workflow friction
  - Accessibility or reliability consequences
  - Trade-offs that conflict with the end user and need captured in the plan's problem framing

## Codebase Verification Checklist

Inspect enough of the real project to anchor the critique in the current codebase rather than generic advice.

| Check | Look for |
| --- | --- |
| Dependency manifest | Package manager, runtime, framework, top relevant dependencies |
| Config files | Build, lint, test, framework, deployment, or language settings |
| Representative source files | Import patterns, routing, data access, state management, testing style |
| Existing architecture | Conventions the plan should preserve or intentionally change |

## Evidence Policy

Use current evidence only for decisions that materially affect framework, library, architecture, testing, security, performance, or maintainability.

| Evidence need | Source |
| --- | --- |
| Exact API or framework behavior | Official project documentation or vendor guidance |
| Maintenance, adoption, or maturity signal | Official release notes, project repository, vendor status page, or Thoughtworks Radar |
| Method rationale | `../references/external-sources.md` source map |
| Alternative comparison | Current source that names concrete trade-offs relevant to this project |

Keep evidence short in the artifact. Cite enough for downstream review, but do not paste raw search output or whole pages.

When sources disagree, first try to resolve the conflict by checking source authority, recency, version applicability, scope, and fit for this project. If credible current sources still materially contradict each other after that research, raise or retain the critique item, set `Severity` to `HIGH`, and state the contradiction in the item's web findings. The developer must see unresolved evidence conflicts because there is no single safe default for the agent to choose silently.

## Severity Rubric

| Severity | Meaning |
| --- | --- |
| `HIGH` | A core assumption is unvalidated, the default choice looks unjustified, a clearly better fit exists for this project, or credible current sources materially contradict each other after research |
| `MEDIUM` | Real alternatives or trade-offs exist and were not considered deeply enough |
| `LOW` | Worth recording for awareness in the critique artifact, but not worth interrupting the developer |

`HIGH` is the user-surfacing threshold. Treat `HIGH` and any future severity explicitly above `HIGH` as eligible for the clarification manifest. `MEDIUM` and `LOW` items remain in the critique artifact for auditability, but they are not user-facing questions.

Problem-framing items also map to tiers:

- `HIGH` → Tier 3 hard gate
- `MEDIUM` and `LOW` → Tier 2

## Do Not Raise

Do not raise an item when:

- The existing stack already constrains the decision and the plan respects that constraint
- The Decisions Log already records an answer to the same concern, even if the wording, order, or item ID changed between iterations
- The difference is purely stylistic and has no meaningful trade-off
- You cannot name a concrete alternative or explain why it matters

## Good Critique Characteristics

Each critique item should:

- Name the exact decision being challenged
- Explain why it looks questionable for this project
- Name concrete alternatives
- Explain what would need to be true for each option to be correct
- Tie the consequence back to user value or implementation cost
