# Platform Adaptation

> Load this file after `REPO_STATE: PASS` when the returned platform is GitLab,
> Bitbucket, GitHub Enterprise, unknown, or when GitHub tooling cannot
> authenticate against a GitHub-compatible repository. Fetch exact command or API
> syntax from `./external-resources.md` only for the active platform.

Non-GitHub flows keep the same safety gates: validate auth, confirm refs on the
recorded remote name, compare the approved branch range, preview exact fields,
wait for user approval, create, verify, and return the URL.

## Strategy Map

| Platform | Local behavior | External source trigger |
| -------- | -------------- | ----------------------- |
| GitLab | Use merge-request semantics and the team's installed `glab` or approved API wrapper | Fetch GitLab MR, `glab mr create`, labels, or Code Owners docs when flags or fields are uncertain |
| Bitbucket | Use the repository's standard CLI or REST wrapper; return `BLOCKED` when no safe create path is discoverable | Fetch Bitbucket create-PR, pull-request API, refs API, or default-reviewer docs |
| Unknown or self-hosted | Ask which hosting platform and tooling to use before creating anything | Fetch only the docs for the user-named platform or tool |

If platform behavior is still unsafe after this lookup, route to the human gate
for hosting platform or approved tooling and return `BLOCKED` until the user
answers.

## Field Mapping

Reuse the approved preview values exactly:

- Remote name identifies the local remote whose refs were validated.
- Target branch maps to base or target branch.
- Current branch maps to source or head branch.
- Title and body map to PR or MR title and description.
- Draft or ready state maps to the platform's equivalent when supported.
- Reviewers and labels are included only after platform validation.

## Failure Mapping

Use the failure envelope in `./execution-contracts.md`:

| Situation | Envelope code |
| --------- | ------------- |
| Missing tooling, token, or permission | `AUTH` |
| Missing target branch | `BASE_BRANCH_MISSING` |
| Source branch cannot be compared remotely | `HEAD_BRANCH_UNPUSHED` |
| Empty compare range | `EMPTY_DIFF` |
| Platform or create workflow cannot be determined safely | `BLOCKED` |
| User declines a confirmation gate | `CANCELLED` |
| Creation or verification fails after approval | `CREATE_ERROR` |
