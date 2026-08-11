# Frontend Commands (current state)

> **Short-lived reference.** This file describes the current state of the tooling and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Bootstrap

- `scripts/setup-node.sh` — bootstrap and smoke test: installs the pinned Node.js (see `.nvmrc`) and pnpm via fnm/corepack, installs dependencies, then runs lint, fix, test, coverage, and a production build. When to run it is governed by the `Always` section in [`AGENTS.md`](../AGENTS.md).

## Environment

Server code decodes `process.env` against `envSchema` in `src/shared/config/env/env.mod.server.ts` on every request. `BACKEND_URL` is required (an `http` or `https` URL). `DATABASE_URL` is optional until the database client is wired in. There is no `.env.example` in this service; the schema file is the current list.

## Core commands

- `pnpm run dev` — start the development server.
- `pnpm run build` — build for production (`vite build`).
- `pnpm run preview` — preview the production build.
- `pnpm run test` — run the test suite once (`vitest run`); `test:watch` and `test:coverage` variants exist.
- `pnpm run lint` — run all checks in parallel: `eslint`, `oxfmt --check`, `oxlint`, and `tsc --build` (`lint:eslint`, `lint:oxfmt`, `lint:oxlint`, `lint:types`).
- `pnpm run fix` — auto-fix sequentially: `eslint --fix`, `oxfmt --write`, `oxlint --fix`.
- Route generation: the TanStack Router plugin rewrites `src/routeTree.gen.ts` during `pnpm run dev` and `pnpm run build`; there is no separate script. Never edit that file by hand. After you add or rename a route file, run one of those commands to regenerate it.

## Database

- `pnpm run db:generate` / `pnpm run db:migrate` — Drizzle migrations (see [architecture](./architecture.md)).

## Cleaning

- `pnpm run clean:soft` / `pnpm run clean:hard` — clean build artifacts (`scripts/soft-clean.ts`, `scripts/hard-clean.ts`).

## Formatting

- This repo uses `oxfmt`, not Prettier. Format a specific file with `pnpm exec oxfmt <file>`.
