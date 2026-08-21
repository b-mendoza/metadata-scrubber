# Current frontend commands

> **Short-lived reference.** This file describes the current state of the tooling. Update it when the tooling changes. If this file does not match the code, follow the code.

## Bootstrap

- `scripts/setup-node.sh` bootstraps the service and runs a smoke test. fnm installs the pinned Node.js version from `.nvmrc`. corepack installs pnpm. After dependency installation, the script runs lint, fix, test, coverage, and a production build. The `Always` section in [`AGENTS.md`](../AGENTS.md) defines when to run this script.

## Environment

On each request, server code decodes `process.env` against `envSchema` in `src/shared/config/env/env.mod.server.ts`. Set `BACKEND_URL` to an `http` or `https` URL. The schema requires this variable. `DATABASE_URL` remains optional until developers connect the database client. This service has no `.env.example`. The schema file contains the current variable list.

## Core commands

- `pnpm run dev` starts the development server.
- `pnpm run build` runs the production build with `vite build`.
- `pnpm run preview` previews the production build.
- `pnpm run test` starts one test suite run with `vitest run`. The service has `test:watch` and `test:coverage` variants.
- `pnpm run lint` runs `eslint`, `oxfmt --check`, `oxlint`, and `tsc --build` in parallel. The separate commands are `lint:eslint`, `lint:oxfmt`, `lint:oxlint`, and `lint:types`.
- `pnpm run fix` runs this sequence: `eslint --fix`, `oxfmt --write`, and `oxlint --fix`.
- The TanStack Router plugin rewrites `src/routeTree.gen.ts` during `pnpm run dev` and `pnpm run build`. The service has no separate route-generation script. Do not make manual changes to `src/routeTree.gen.ts`. After you add or rename a route file, run one of these commands to regenerate it.

## Database

- Use `pnpm run db:generate` and `pnpm run db:migrate` for Drizzle migrations. See the [architecture reference](./architecture.md).

## Cleaning

- `pnpm run clean:soft` and `pnpm run clean:hard` clean build artifacts. They run `scripts/soft-clean.ts` and `scripts/hard-clean.ts`.

## Formatting

- Use `oxfmt` for formatting. Do not use Prettier. Run `pnpm exec oxfmt <file>` to format one file.
