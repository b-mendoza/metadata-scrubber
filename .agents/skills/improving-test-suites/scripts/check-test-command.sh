#!/usr/bin/env bash
# check-test-command.sh — allowlist guard for improving-test-suites validator.
# Usage: check-test-command.sh "<command string>"
# Exit 0 if the command matches a known test runner prefix; 1 otherwise; 64 usage.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf '%s\n' "usage: $0 \"<command string>\"" >&2
  exit 64
fi

cmd="$1"
# Trim leading whitespace
cmd_trimmed="${cmd#"${cmd%%[![:space:]]*}"}"

case "$cmd_trimmed" in
  pytest\ *|pytest)
    exit 0
    ;;
  python\ -m\ pytest\ *|python\ -m\ pytest)
    exit 0
    ;;
  go\ test\ *|go\ test)
    exit 0
    ;;
  npm\ test\ *|npm\ test)
    exit 0
    ;;
  yarn\ test\ *|yarn\ test)
    exit 0
    ;;
  pnpm\ test\ *|pnpm\ test)
    exit 0
    ;;
  npx\ vitest\ *|npx\ vitest)
    exit 0
    ;;
  npx\ jest\ *|npx\ jest)
    exit 0
    ;;
  cargo\ test\ *|cargo\ test)
    exit 0
    ;;
  mvn\ test\ *|mvn\ test)
    exit 0
    ;;
  ./gradlew\ test\ *|./gradlew\ test)
    exit 0
    ;;
  rspec\ *|rspec)
    exit 0
    ;;
  mix\ test\ *|mix\ test)
    exit 0
    ;;
  *)
    printf '%s\n' "command not on test-runner allowlist: $cmd_trimmed" >&2
    exit 1
    ;;
esac
