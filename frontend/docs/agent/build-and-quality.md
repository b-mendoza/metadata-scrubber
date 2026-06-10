# Build And Quality Commands

## Bootstrap

- If Node.js (see `.nvmrc`) or pnpm is missing or on the wrong version, run `scripts/setup-node.sh`.

## Core Commands

- `pnpm run dev` — Start the development server.
- `pnpm run build` — Build for production.
- `pnpm run test` — Run the test suite.
- `pnpm run lint` — Run formatting, type-checking, and ESLint (`oxfmt`, `tsc`, `eslint`).
- `pnpm run fix` — Auto-fix supported issues.

## Formatting

- This repo uses `oxfmt`, not Prettier.
- Format a specific file with `pnpm exec oxfmt <file>`.
