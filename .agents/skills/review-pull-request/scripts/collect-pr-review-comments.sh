#!/bin/sh
# Usage: sh collect-pr-review-comments.sh [--dry-run] <owner> <repo> <number> | -h
# Environment: PATH locates gh; GH_TOKEN/GITHUB_TOKEN or gh's saved login.
# Exit: 0 complete/help/dry-run; 3 truncated inner comments (NEEDS_CONTEXT);
# 2 gh missing (TOOLS_MISSING); 4 auth, 1 API failure, 64 usage (REVIEW_ERROR).
# Side effects: GitHub reads and stdout/stderr only; no files or mutations.
# Check, no gh/network: sh collect-pr-review-comments.sh --dry-run cli cli 1
set -eu
usage() {
  printf '%s\n' "Usage: sh $0 [--dry-run] <owner> <repo> <number> | -h" \
    'Environment: PATH; GH_TOKEN/GITHUB_TOKEN or gh saved login (github.com).'
}
invalid() { usage >&2; exit 64; }
if [ "$#" -eq 1 ] && [ "$1" = -h ]; then usage; exit 0; fi
dry_run=false
if [ "${1-}" = --dry-run ]; then dry_run=true; shift; fi
[ "$#" -eq 3 ] || invalid
owner=$1 repo=$2 number=$3
case "$owner" in '' | [!A-Za-z0-9]* | *[!A-Za-z0-9-]*) invalid ;; esac
case "$repo" in '' | . | .. | *[!A-Za-z0-9_.-]*) invalid ;; esac
case "$number" in '' | *[!0-9]* | 0*) invalid ;; esac
# shellcheck disable=SC2016 # GraphQL variables must reach gh literally.
query='query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved path line
          comments(first: 100) {
            totalCount
            pageInfo { hasNextPage }
            nodes { fullDatabaseId url author { login } body }
          }
        }
      }
    }
  }
}'
projection='
  def comment_id:
    if . == null then error("missing fullDatabaseId") else tostring end;
  if (.errors // [] | length) > 0 or
     (.data.repository.pullRequest.reviewThreads.nodes | type) != "array"
  then error("inaccessible or invalid review thread history")
  else [.data.repository.pullRequest.reviewThreads.nodes[] |
    if (.id | type) != "string" or (.isResolved | type) != "boolean" or
       (.path | type) != "string" or (.comments.totalCount | type) != "number" or
       (.comments.pageInfo.hasNextPage | type) != "boolean"
    then error("invalid review thread metadata")
    else {
      thread_id: .id, is_resolved: .isResolved, path, line,
      root_comment_id: (.comments.nodes[0].fullDatabaseId | comment_id),
      root_url: .comments.nodes[0].url,
      comments_total: .comments.totalCount,
      comments_truncated: (.comments.pageInfo.hasNextPage or ((.comments.nodes | length) < .comments.totalCount)),
      comments: [.comments.nodes[] |
        {id: (.fullDatabaseId | comment_id), url, author: .author.login, body}]
    } end
  ][] | tojson end'
if "$dry_run"; then
  printf 'gh api graphql --hostname github.com --paginate -f owner=%s -f repo=%s -F number=%s \\\n' "$owner" "$repo" "$number"
  printf '  -f query=%s \\\n  --jq %s\n' "'$query'" "'$projection'"
  exit 0
fi
if ! command -v gh >/dev/null 2>&1; then
  printf '%s\n' 'gh CLI required' >&2
  exit 2
fi
# Buffer all pages so a later API failure cannot publish a successful partial read.
if output=$(gh api graphql --hostname github.com --paginate \
  -f owner="$owner" -f repo="$repo" -F number="$number" \
  -f query="$query" --jq "$projection"); then
  if [ -n "$output" ]; then printf '%s\n' "$output"; fi
  case "$output" in *'"comments_truncated":true'*) exit 3 ;; esac
  exit 0
else
  status=$?
  if [ "$status" -eq 4 ]; then exit 4; fi
  exit 1
fi
