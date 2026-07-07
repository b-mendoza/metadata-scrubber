# Verifying your work

Passing tests is a floor, not proof that the change is correct. After a substantive change:

- Run the affected service's lint and formatting check after the change, and its test suite before committing. See the service's `AGENTS.md` for the exact commands, and confirm they pass before calling the work done.
- Confirm that any file, path, or symbol you reference actually exists on disk. Do not point documentation or code at something you have not verified.
- Do not hand-edit generated or tooling-managed files such as lockfiles (`pnpm-lock.yaml`, `go.sum`). Let the managing tool produce those changes.
- If the change alters a service's architecture, file conventions, or commands, update the matching short-lived reference doc under that service's `docs/` directory in the same change. Short-lived docs describe what exists on disk — never aspirations.

Where a service has no automated check for something, treat that as a known gap, not as permission to skip verification. When you are unsure whether a change is correct, escalate to the user rather than declaring success.
