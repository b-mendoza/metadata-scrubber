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

## Markdown language and documentation

For `**/*.md`, report a violation of this section as a non-blocking bug.

- Review Markdown for ASD-STE100 Simplified Technical English.
- Require short sentences in active voice. Require one idea in each sentence.
- Prefer the simplest word that keeps the meaning. Require one consistent word
  for one concept. Keep technical names, identifiers, commands, and code exact.
- Require general guides to describe general practices, not specific
  implementations.
- Accept factual references about architecture and known issues.
- Accept specific decided patterns in `frontend/docs/conventions.md` and
  `backend/docs/conventions.md` when two or more patterns are valid.
- In these convention files, require a reason for each choice. Verify that each
  identifier named in these convention files exists in the code.
- Reject versions, file inventories, and commands in these convention files.
- Require removal of conventions that lint rules enforce or that no longer match
  the project's choice.
- Keep command inventories in project manifests.
