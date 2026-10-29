#!/usr/bin/env bash
# Install the project's pnpm and Node.js versions, then run the smoke test suite.
set -euo pipefail

# Resolve the frontend root from this script location so it can be run from anywhere.
FRONTEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${FRONTEND_ROOT}"

# The standalone pnpm binary does not need Node.js. pnpm then installs the
# Node.js version that package.json declares.
PNPM_HOME="${PNPM_HOME:-${HOME}/.local/share/pnpm}"
export PNPM_HOME
if [[ ":${PATH}:" != *":${PNPM_HOME}/bin:"* ]]; then
    export PATH="${PNPM_HOME}/bin:${PATH}"
fi
if [[ ":${PATH}:" != *":${PNPM_HOME}:"* ]]; then
    export PATH="${PNPM_HOME}:${PATH}"
fi

# pnpm 12 supports the devEngines pin and the lockfile boot document.
if ! pnpm_version="$(pnpm --version 2>/dev/null)" \
    || [[ ! "$pnpm_version" =~ ^([0-9]+)\. ]] \
    || [[ $((10#${BASH_REMATCH[1]})) -lt 12 ]]; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PATH="${PNPM_HOME}/bin:${PATH}"
fi

pnpm install --frozen-lockfile

# Run smoke tests: lint, autofix, tests, coverage, and production build.
pnpm run lint
pnpm run fix
pnpm run test
pnpm run test:coverage
pnpm run build

echo "Setup complete and smoke tests passed."
