# Frontend Commands (current state)

> **Short-lived reference.** This file describes the current state of the tooling and must be updated whenever that state changes. If this file and the code disagree, the code wins — fix this file.

## Bootstrap

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh`.

## Core commands

- `pnpm run dev` — start the development server.
- `pnpm run build` — build for production (`vite build`).
- `pnpm run preview` — preview the production build.
- `pnpm run test` — run the test suite once (`vitest run`); `test:watch` and `test:coverage` variants exist.
- `pnpm run lint` — run all checks in parallel: `eslint`, `oxfmt --check`, `oxlint`, and `tsc --build` (`lint:eslint`, `lint:oxfmt`, `lint:oxlint`, `lint:types`).
- `pnpm run fix` — auto-fix sequentially: `eslint --fix`, `oxfmt --write`, `oxlint --fix`.

## Database

- `pnpm run db:generate` / `pnpm run db:migrate` — Drizzle migrations (see [architecture](./architecture.md)).

## Cleaning

- `pnpm run clean:soft` / `pnpm run clean:hard` — clean build artifacts (`scripts/soft-clean.ts`, `scripts/hard-clean.ts`).

## Formatting

- This repo uses `oxfmt`, not Prettier. Format a specific file with `pnpm exec oxfmt <file>`.
