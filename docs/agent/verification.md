# Verifying your work

These are general verification practices. The code is the source of truth. Passing tests do not prove that a change is correct. Complete these steps after a substantive change.

- Read the project manifest before choosing a check. Report a configured check that is missing or broken. Do not guess a replacement.
- Report a check as passing after you run it against the current change and see it pass. Include failures and warnings in the result. Do not make the result appear cleaner than the command output.
- Confirm on disk each file, path, or symbol that you reference. Do not point documentation or code to an item that you did not verify.
- Let the owning tool change generated and tooling-managed files. Change the source or generator. Regenerate the managed file. Let the tool produce the diff.
- Update a factual reference when the code makes it wrong. Include the reference update in the same change. Keep implementation instructions out of the reference.

State what the checks cannot detect. Report each part of the change that you cannot exercise. Report each area that has no automated check. Treat each item as a known gap. A gap does not permit you to skip verification. A passing result does not show coverage that the check lacks.
