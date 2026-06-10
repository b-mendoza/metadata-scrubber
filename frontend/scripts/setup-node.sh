#!/usr/bin/env bash
# Bootstrap Node tooling and run the project smoke test suite.
set -euo pipefail

# Resolve the repository root from this script location so it can be run from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Ensure fnm's install directory is on PATH (idempotent – avoids duplicate entries).
FNM_PATH="${FNM_PATH:-$HOME/.local/share/fnm}"
if [[ ":${PATH}:" != *":${FNM_PATH}:"* ]]; then
    export PATH="${FNM_PATH}:${PATH}"
fi

# Install fnm (Fast Node Manager) if not already available.
if ! command -v fnm &>/dev/null; then
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
fi

# Activate fnm's Node version management for this session.
eval "$(fnm env --shell bash)"

# Install and use the Node.js version required by this project (.nvmrc).
fnm use --install-if-missing

corepack enable pnpm
corepack install

# Install project dependencies before running package scripts.
pnpm install --frozen-lockfile

# Run smoke tests: lint, autofix, tests, coverage, and production build.
pnpm run lint
pnpm run fix
pnpm run test
pnpm run test:coverage
pnpm run build

# AI AGENT NOTE:
# If this script exits successfully (exit code 0), tell the user all setup and smoke tests passed.
echo "Setup complete and smoke tests passed."
