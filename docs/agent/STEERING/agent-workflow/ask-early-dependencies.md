# Ask before you add a dependency

Scope: every new runtime dependency or tool.

Why: a dependency adds supply-chain, license, and upgrade cost. The owner decides whether to accept it.

## Do's
### Check existing dependencies, then propose any new dependency before installation

Check whether the standard library, platform, or an installed dependency meets the need. If a new dependency is needed, explain the reason and alternatives. Wait for approval before adding it.

```text
Hypothetical proposal: the requested format needs a decoder that the installed tools lack.
I will compare decoder options and their costs before proposing a package for approval.
No package or lockfile has changed.
```

## Don'ts
### Do not install first or propose an installed dependency as new

```text
I added a decoder and changed the lockfile before checking the existing dependencies.
Approve it now so I can finish.
```
