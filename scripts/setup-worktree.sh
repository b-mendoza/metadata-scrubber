#!/usr/bin/env bash
# Prepare frontend dependencies and local env files for a worktree.
# Git hooks live in the shared Git directory. Run `go -C backend tool task hooks:install` once per clone.
set -euo pipefail

cd "$(dirname "$0")/.."

# Copy one local env file. Never print the file contents.
copy_local_env() {
  origin_root=$1
  relative_path=$2
  source_file="${origin_root}/${relative_path}"
  dest_file="${relative_path}"
  if [ -f "${source_file}" ] && [ ! -e "${dest_file}" ]; then
    mkdir -p "$(dirname -- "${dest_file}")"
    cp -- "${source_file}" "${dest_file}"
    printf 'Copied %s from the original checkout\n' "${relative_path}"
  fi
}

# A PATH pnpm can be a Corepack shim; a prompt would block non-interactive setup.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm --dir frontend install --frozen-lockfile

# Copy local env files from the original checkout. Do not print file contents.
ORIGIN_ROOT="${ROOT_WORKTREE_PATH:-${T3CODE_PROJECT_ROOT:-}}"
if [ -n "${ORIGIN_ROOT}" ] && [ -d "${ORIGIN_ROOT}" ]; then
  ORIGIN_ROOT="$(cd "${ORIGIN_ROOT}" && pwd)"
  if [ "${ORIGIN_ROOT}" != "$PWD" ]; then
    copy_local_env "${ORIGIN_ROOT}" backend/.env
    copy_local_env "${ORIGIN_ROOT}" frontend/.env
  fi
fi
