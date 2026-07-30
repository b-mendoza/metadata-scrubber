# Verifying your work

Passing tests is a floor, not proof that the change is correct. After a substantive change:

- Run the affected service's lint check after the change and its test suite before committing, using exactly the commands its `AGENTS.md` documents — never invented or guessed ones. If a documented command is missing or broken, say so instead of improvising a substitute.
- Report a check as passing only when you ran it against the current state of the change and saw it pass. Report results as they are — failures and warnings included — rather than summarizing them into a cleaner story.
- Confirm that any file, path, or symbol you reference actually exists on disk. Do not point documentation or code at something you have not verified.
- Generated and tooling-managed files (lockfiles such as `pnpm-lock.yaml` and `go.sum` among them) are owned by their tools: change the source or generator and regenerate, letting the tool produce the diff.
- If the change alters a service's architecture, file conventions, or commands, update the matching short-lived reference doc under that service's `docs/` directory in the same change. Short-lived docs describe what exists on disk — never aspirations.

Where a service has no automated check for something, treat that as a known gap, not as permission to skip verification. When you are unsure whether a change is correct, escalate to the user rather than declaring success.
