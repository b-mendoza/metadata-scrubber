#!/usr/bin/env bash
# Prepare frontend and backend dependencies and local env files for a worktree.
# Git hooks live in the shared Git directory. Run `go -C backend tool task hooks:install` once per clone.
set -euo pipefail

cd "$(dirname "$0")/.."

# A PATH pnpm can be a Corepack shim; a prompt would block non-interactive setup.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
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
