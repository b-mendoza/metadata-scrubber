#!/usr/bin/env bash
# Prepare frontend and backend dependencies, local env files, and Git hooks for a worktree.
set -euo pipefail

cd "$(dirname "$0")/.."

# The standalone pnpm binary does not need Node.js. pnpm then installs the
# Node.js version that frontend/package.json declares.
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

pnpm --dir frontend install --frozen-lockfile

# Fill the shared Go module cache so later Go commands work without network access.
go -C backend mod download

main_checkout="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
for file in backend/.env frontend/.env; do
  if [ -f "$main_checkout/$file" ] && [ ! -e "$file" ]; then
    cp -- "$main_checkout/$file" "$file"
    printf 'Copied %s from the main checkout\n' "$file"
  fi
done

# Git hooks live in the shared Git directory, so this also updates them for the main checkout and every worktree.
go -C backend tool task hooks:install
