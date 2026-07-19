#!/usr/bin/env bash

SCOPE="bryan-mendozas-projects"
PROJECT="metadata-scrubber"
REPOSITORY="backend"
KEEP_IMAGES=5

images=$(pnpm dlx --allow-build=esbuild vercel vcr image ls "$REPOSITORY" \
  --scope "$SCOPE" \
  --project "$PROJECT" \
  --format json \
  --limit 100 |
  jq '.images | sort_by(.createdAt) | reverse')

image_count=$(jq 'length' <<<"$images")
keep_count=$((image_count < KEEP_IMAGES ? image_count : KEEP_IMAGES))
cleanup_count=$((image_count - keep_count))

printf 'Keeping %d images:\n' "$keep_count"
jq -r --argjson keep "$KEEP_IMAGES" \
  '.[:$keep][] | "  \(.id) (tags: \(.tags | join(", ")))"' <<<"$images"

printf '\nCleaning up %d images:\n' "$cleanup_count"
jq -r --argjson keep "$KEEP_IMAGES" \
  '.[$keep:][] | "  \(.id) (tags: \(.tags | join(", ")))"' <<<"$images"

jq -r --argjson keep "$KEEP_IMAGES" '.[$keep:][] | .id' <<<"$images" |
  while read -r image_id; do
    printf 'Deleting %s...\n' "$image_id"
    pnpm dlx --allow-build=esbuild vercel vcr image rm "$REPOSITORY" "$image_id" \
      --scope "$SCOPE" \
      --project "$PROJECT" \
      --yes
  done
