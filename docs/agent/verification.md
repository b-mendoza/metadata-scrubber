# Verifying your work

Passing tests do not prove that a change is correct. The required workflow in the root agent guide defines this standard. Complete these steps after a substantive change.

- Run the commands documented in the service's `AGENTS.md`. Do not invent or guess a command. Report a documented command that is missing or broken. Do not improvise a replacement.
- Report a check as passing after you run it against the current change and see it pass. Include failures and warnings in the result. Do not make the result appear cleaner than the command output.
- Confirm on disk each file, path, or symbol that you reference. Do not point documentation or code to an item that you did not verify.
- Let the owning tool change generated and tooling-managed files. These files include lockfiles such as `pnpm-lock.yaml` and `go.sum`. Change the source or generator. Regenerate the managed file. Let the tool produce the diff.
- Update the matching short-lived reference under the affected root or service `docs/` directory when a change alters architecture, file conventions, or commands. Include the reference update in the same change. Short-lived references describe items that exist on disk.

State what the checks cannot detect. Report each part of the change that you cannot exercise. Report each area that has no automated check. Treat each item as a known gap. A gap does not permit you to skip verification. A passing result does not show coverage that the check lacks.
