#!/usr/bin/env bash
# Prepare frontend dependencies and local env files for a worktree.
# Git hooks live in the shared Git directory. Run `go -C backend tool task hooks:install` once per clone.
set -euo pipefail

cd "$(dirname "$0")/.."

# A PATH pnpm can be a Corepack shim; a prompt would block non-interactive setup.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm --dir frontend install --frozen-lockfile

origin="${ROOT_WORKTREE_PATH:-${T3CODE_PROJECT_ROOT:-}}"
if [ -d "$origin" ]; then
  for file in backend/.env frontend/.env; do
    if [ -f "$origin/$file" ] && [ ! -e "$file" ]; then
      cp -- "$origin/$file" "$file"
      printf 'Copied %s from the original checkout\n' "$file"
    fi
  done
fi
