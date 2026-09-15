# Ask before each commit or outward action

Scope: every change.

Why: a commit records local history. A push, pull request, or issue can notify others. The user controls each action.

## Do's
### Wait for an explicit request for each action and stage only the requested paths

Editing gives no permission to commit, push, open a pull request, or create an issue. Permission for one action does not authorize another. Preserve the user's unrelated changes, including changes in a file that the task touches. Inspect the staged diff before a requested commit.

```text
Hypothetical request: commit only the documentation changes locally.
Stage only those changes. Leave unrelated changes untouched.
Do not push, open a pull request, or file an issue without an explicit request for that action.
```

## Don'ts
### Do not stage everything or treat edit permission as commit or publication permission

```sh
# No commit or push was requested.
git add -A && git commit -m "wip" && git push
```
