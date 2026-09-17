# Bootstrap only a missing or mismatched toolchain

Scope: Node, pnpm, formatting, and the bootstrap script.

Why: the manifests own the pins, and bootstrap changes the machine and working tree.

## Do's

### Read the pins and bootstrap only when needed

Use `pnpm` for this service. Read `.nvmrc`, `package.json#engines.node`, and `package.json#packageManager` instead of copying their versions into prose. From `frontend/`, check the installed tools:

```bash
node --version
pnpm --version
```

Use `oxfmt`, not Prettier. `pnpm exec oxfmt --check <file>` checks one file without writing; `pnpm exec oxfmt --write <file>` formats it in place.

If a tool is missing or mismatched and setup is in scope, use `bash scripts/setup-node.sh`. It installs fnm if needed, selects the pinned Node version, enables pnpm through Corepack, and installs dependencies. It then runs lint, autofix, tests, coverage, and a production build. Warn about these installs and writes before running it.

## Don'ts

### Do not bootstrap as a routine docs check or invent another entry point

These are not verification-only commands:

```bash
bash scripts/setup-node.sh # installs tools and dependencies; runs autofix and build
pnpm run bootstrap # no such package script
```

For a docs-only request that excludes setup, report a mismatch without running bootstrap. A later request can explicitly include setup.
