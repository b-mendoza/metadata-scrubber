#!/usr/bin/env bash

SCOPE="bryan-mendozas-projects"
PROJECT="metadata-scrubber"
REPOSITORY="backend"
KEEP_IMAGES=5

pnpm dlx vercel vcr image ls "$REPOSITORY" \
  --scope "$SCOPE" \
  --project "$PROJECT" \
  --format json \
  --limit 100 |
  jq -r --argjson keep "$KEEP_IMAGES" \
    '.images | sort_by(.createdAt) | reverse | .[$keep:] | .[].id' |
  while read -r image_id; do
    pnpm dlx vercel vcr image rm "$REPOSITORY" "$image_id" \
      --scope "$SCOPE" \
      --project "$PROJECT" \
      --yes
  done
