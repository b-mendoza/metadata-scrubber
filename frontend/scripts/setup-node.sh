#!/usr/bin/env bash
# Install the pnpm and Node.js versions that package.json declares, then install dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

# The standalone pnpm binary does not need Node.js. pnpm then installs the
# pnpm and Node.js versions that package.json declares.
export PNPM_HOME="${PNPM_HOME:-${HOME}/.local/share/pnpm}"
export PATH="${PNPM_HOME}/bin:${PATH}"

# pnpm 12 supports the devEngines pin and the lockfile boot document.
if [[ ! "$(pnpm --version 2>/dev/null)" =~ ^([0-9]+)\. ]] || ((BASH_REMATCH[1] < 12)); then
  curl -fsSL https://get.pnpm.io/install.sh | sh -
fi

pnpm install --frozen-lockfile
