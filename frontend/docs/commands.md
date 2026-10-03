# Current frontend commands

> **Short-lived reference.** This file describes the current state of the tooling. Update it when the tooling changes. If this file does not match the code, follow the code.

## Bootstrap

- `scripts/setup-node.sh` bootstraps the service and runs a smoke test. fnm installs the pinned Node.js version from `.nvmrc`. corepack installs pnpm. After dependency installation, the script runs lint, fix, test, coverage, and a production build. The `Always` section in [`AGENTS.md`](../AGENTS.md) defines when to run this script.

## Environment

On each request, the app-bindings middleware in `src/shared/middlewares/app-bindings/app-bindings.mod.ts` parses `process.env` with `environmentSchema`. Set `BACKEND_URL` to an `http` or `https` URL. The schema requires this variable. This service has no `.env.example`. The schema file contains the current variable list.

## Core commands

- `pnpm run dev` starts the development server.
- `pnpm run build` runs the production build with `vite build`.
- `pnpm run preview` previews the production build.
- `pnpm run test` starts one test suite run with `vitest run`. The service has `test:watch` and `test:coverage` variants. The suite includes source tests and tests next to the scripts.
- `pnpm run lint` runs every `lint:*` command in parallel. These commands check ESLint policy, lint directives, React Doctor findings, unused code, formatting, Oxlint rules, and TypeScript types.
- `pnpm run lint:knip` runs `knip --no-progress`. It checks for unused files, dependencies, and exports.
- `pnpm run lint:directives` checks the files selected by the real ESLint config. The guard parses comments with inline configuration disabled. It accepts only `// eslint-disable-next-line <rule ids> -- <reason>` and `// react-doctor-disable-next-line <rule ids> -- <reason>`. Each exception needs rule ids and a non-empty reason for review.
- `pnpm run lint:policy` compares resolved ESLint rules with `scripts/lint-policy.snapshot`. It removes the `oxlint/*` bridge entries before it resolves each scope. It reports each added, removed, or changed rule.
- `pnpm run policy:update` writes the policy snapshot. Run it only after a deliberate rule-set review. Neither `lint` nor `fix` updates the snapshot.
- `pnpm run fix` runs this sequence: `eslint --fix`, `oxfmt --write`, and `oxlint --fix`.
- `pnpm run lint:doctor` runs React Doctor on files changed since the `origin/main` merge base. It ignores findings in the Oxlint plugin. It sets `CI=1` to prevent an interactive report that waits for terminal input. Telemetry, scoring, and the supply-chain scan are off. Warnings and errors fail the check. In CI, the pull-request checkout has no branch to compare, so the lint job scans the full frontend.
- The TanStack Router plugin rewrites `src/routeTree.gen.ts` during `pnpm run dev` and `pnpm run build`. The service has no separate route-generation script. Do not make manual changes to `src/routeTree.gen.ts`. After you add or rename a route file, run one of these commands to regenerate it.

## Cleaning

- `pnpm run clean:soft` and `pnpm run clean:hard` clean build artifacts. They run `scripts/soft-clean.ts` and `scripts/hard-clean.ts`.

## Formatting

- Use `oxfmt` for formatting. Do not use Prettier. Run `pnpm exec oxfmt <file>` to format one file.
