These rules apply to the whole repository.

## Review authority

- Keep this review advisory. Do not provide the only merge approval.
- For factual references, the code is the source of truth. If a factual reference
  and the code disagree, follow the code and report the stale reference.
- Read `frontend/docs/conventions.md` and `backend/docs/conventions.md` for each
  service's decided conventions. Require new and changed code to follow its
  service's conventions. Report a mismatch instead of copying code that
  disagrees.

## Deterministic checks

- Review only concerns that deterministic checks cannot enforce.
- Never waive, override, or discount a failing deterministic check.
- Do not review complexity limits, switch statements, class syntax, lookup-map
  structure, formatting, or other rules that deterministic checks own.
- Review each decided convention even when it names one of these constructs.
