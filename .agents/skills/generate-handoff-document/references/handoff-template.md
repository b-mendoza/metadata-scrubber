# Handoff Template

This template is consumed by `document-assembler`. Placeholder names identify
their source artifact or deterministic fallback. The assembler must render the
defined zero-state strings from [`data-contracts.md`](./data-contracts.md) when
source arrays are empty; no literal `<placeholder>` text may remain.

```markdown
# Handoff Document: <SUBJECT from input or fallback>

> Advisory: <only when Sections 2 through 4 are all zero-state; otherwise omit>

## Session Metadata

- **Generated:** <UTC timestamp from system clock>
- **Status:** <Completed when zero open questions remain; otherwise In Progress>
- **Subject:** <SUBJECT>
- **Transcript lines:** <context.source_summary.line_count>
- **Total Q&A exchanges:** <context.source_summary.qa_exchanges>
- **Total insights documented:** <insights.summary.insights>
- **Claims validated:** <claims.summary.checked or skipped>
- **Critical findings:** <insights.summary.critical>
- **Open questions:** <computed open-question count>
- **Working artifacts:**
  - Transcript: `<TRANSCRIPT_FILE or none>`
  - Context: `<CONTEXT_FILE>`
  - Insights: `<INSIGHTS_FILE>`
  - Claims: `<CLAIMS_FILE or none>`
  - Previous handoff backup: `<PREV_FILE or none>`

## 1. Original Instructions & Scope

**Fulfills:** Preserve the mandate, scope, constraints, and amendments needed to
continue the work.

<Render active original instructions and mandate from CONTEXT_FILE. Mark
superseded or unclear items explicitly. If none exist, render the Section 1
zero-state string from data-contracts.md.>

## 2. Q&A Log

**Fulfills:** Preserve clarifications and user decisions in chronological order.

<Render `qa_log` from CONTEXT_FILE with speaker attribution and order. If empty,
render the Section 2 zero-state string from data-contracts.md.>

## 3. Observations & Insights

**Fulfills:** Transfer evidence-backed findings, decisions, risks, and important
context for a cold-start reader.

<Render each insight from INSIGHTS_FILE with title, priority, claim, rationale,
evidence, verification status, and verification notes. If empty, render the
Section 3 zero-state string from data-contracts.md.>

## 4. Unverified Claims & Validation Checklist

**Fulfills:** Separate verified facts from unverified, partial, or refuted claims
so the next agent does not inherit false certainty.

<Render CLAIMS_FILE claims when available. If claim validation was skipped,
render the Section 4 zero-state string from data-contracts.md and include the
independent-verification warning.>

## 5. Open Questions & Recommended Next Steps

**Fulfills:** Give the next agent concrete actions and unresolved questions.

<Render unresolved questions, verification follow-ups, and next steps. Every next
step must use an action verb and name a concrete file, command, artifact, or
question. If no open questions remain, render the Section 5 zero-state string
from data-contracts.md.>

## Resolved Since Last Handoff

<Only in update mode. Summarize resolved questions or superseded items from
PRIOR_HANDOFF_FILE that should be preserved rather than silently deleted.>
```

## Update Mode

When `PRIOR_HANDOFF_FILE` is supplied, merge still-relevant instructions,
amendments, open questions, and history into the new handoff. Move resolved open
questions to `Resolved Since Last Handoff`; do not silently drop them. The
orchestrator creates `<stem>.prev.md` before overwrite. [F-03]
