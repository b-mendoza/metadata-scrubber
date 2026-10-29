#!/usr/bin/env bash
# Prepare frontend and backend dependencies, local env files, and Git hooks for a worktree.
set -euo pipefail

cd "$(dirname "$0")/.."

frontend/scripts/setup-node.sh

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
