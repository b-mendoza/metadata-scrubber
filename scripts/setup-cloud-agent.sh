#!/usr/bin/env bash
# Prepare frontend and backend dependencies and Git hooks for a Cursor Cloud Agent.
set -euo pipefail

cd "$(dirname "$0")/.."

# A PATH pnpm can be a Corepack shim; a prompt would block non-interactive setup.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm --dir frontend install --frozen-lockfile

# Fill the shared Go module cache so later Go commands work without network access.
go -C backend mod download

# lefthook writes into .git/hooks. Cursor Cloud can set local core.hooksPath to a
# dispatcher that then runs those original hooks. Unset the local value only when
# that dispatcher exists, install lefthook, then restore the value.
hooks_path="$(git config --get core.hooksPath || true)"
if [ -n "${hooks_path}" ] && [ -f "${hooks_path}/.dispatcher" ] && [ -f "${hooks_path}/.cursor-original-hooks-path" ]; then
  git config --local --unset-all core.hooksPath
  lefthook_status=0
  go -C backend tool lefthook install || lefthook_status=$?
  git config --local core.hooksPath "${hooks_path}"
  if [ "${lefthook_status}" -ne 0 ]; then
    exit "${lefthook_status}"
  fi
else
  go -C backend tool lefthook install
fi
