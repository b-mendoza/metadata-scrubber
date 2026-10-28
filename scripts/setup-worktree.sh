#!/usr/bin/env bash
# Prepare a fresh Git worktree or agent checkout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_DIR="${REPO_ROOT}/backend"

# Copy one local env file. Never print the file contents.
copy_local_env() {
  origin_root=$1
  relative_path=$2
  source_file="${origin_root}/${relative_path}"
  dest_file="${REPO_ROOT}/${relative_path}"
  if [ -f "${source_file}" ] && [ ! -e "${dest_file}" ]; then
    mkdir -p "$(dirname -- "${dest_file}")"
    cp -- "${source_file}" "${dest_file}"
    printf 'Copied %s from the original checkout\n' "${relative_path}"
  fi
}

if [ ! -f "${FRONTEND_DIR}/package.json" ]; then
  printf 'frontend/package.json is missing\n' >&2
  exit 1
fi
if [ ! -f "${FRONTEND_DIR}/pnpm-lock.yaml" ]; then
  printf 'frontend/pnpm-lock.yaml is missing\n' >&2
  exit 1
fi
if [ ! -f "${BACKEND_DIR}/go.mod" ]; then
  printf 'backend/go.mod is missing\n' >&2
  exit 1
fi
if ! command -v go >/dev/null 2>&1; then
  printf 'go is required\n' >&2
  exit 1
fi

# Use pnpm on PATH, or run the declared version through Corepack.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
(
  cd "${FRONTEND_DIR}"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm_command=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then
    printf 'Enabling Corepack pnpm\n'
    if ! corepack enable pnpm; then
      printf 'Warning: Could not enable the pnpm shim. Using corepack pnpm.\n' >&2
    fi
    pnpm_command=(corepack pnpm)
  else
    printf 'pnpm is required. Enable Corepack or install pnpm.\n' >&2
    exit 1
  fi
  printf 'Installing frontend dependencies\n'
  "${pnpm_command[@]}" install --frozen-lockfile
)

printf 'Downloading Go modules\n'
go -C "${BACKEND_DIR}" mod download

if git -C "${REPO_ROOT}" config --get core.hooksPath >/dev/null 2>&1; then
  printf 'Skip lefthook install because core.hooksPath is set\n'
else
  printf 'Installing Git hooks\n'
  go -C "${BACKEND_DIR}" tool lefthook install
fi

printf 'Verifying Task\n'
go -C "${BACKEND_DIR}" tool task --version

# Copy local env files from the original checkout. Do not print file contents.
ORIGIN_ROOT="${ROOT_WORKTREE_PATH:-${T3CODE_PROJECT_ROOT:-}}"
if [ -n "${ORIGIN_ROOT}" ] && [ -d "${ORIGIN_ROOT}" ]; then
  ORIGIN_ROOT="$(cd "${ORIGIN_ROOT}" && pwd)"
  if [ "${ORIGIN_ROOT}" != "${REPO_ROOT}" ]; then
    copy_local_env "${ORIGIN_ROOT}" backend/.env
    copy_local_env "${ORIGIN_ROOT}" frontend/.env
  fi
fi

printf 'Worktree setup complete\n'
