#!/usr/bin/env bash

VERCEL_SCOPE="bryan-mendozas-projects"
VERCEL_PROJECT="metadata-scrubber"
VCR_REPOSITORY="backend"
IMAGE_RETENTION_LIMIT=5
VERCEL_COMMAND=(pnpm dlx --allow-build=esbuild vercel@57.0.0 vcr)
VERCEL_TARGET_ARGS=(--scope "$VERCEL_SCOPE" --project "$VERCEL_PROJECT")

images_newest_first=$("${VERCEL_COMMAND[@]}" image ls "$VCR_REPOSITORY" \
  "${VERCEL_TARGET_ARGS[@]}" \
  --format json \
  --limit 100 |
  jq '.images | sort_by(.createdAt) | reverse')

image_count=$(jq 'length' <<<"$images_newest_first")
retained_count=$((image_count < IMAGE_RETENTION_LIMIT ? image_count : IMAGE_RETENTION_LIMIT))
cleanup_count=$((image_count - retained_count))

printf 'Keeping %d images:\n' "$retained_count"
jq -r --argjson retained_count "$retained_count" \
  '.[:$retained_count][] | "  \(.id) (tags: \(.tags | join(", ")))"' <<<"$images_newest_first"

printf '\nCleaning up %d images:\n' "$cleanup_count"
jq -r --argjson retained_count "$retained_count" \
  '.[$retained_count:][] | "  \(.id) (tags: \(.tags | join(", ")))"' <<<"$images_newest_first"

jq -r --argjson retained_count "$retained_count" '.[$retained_count:][] | .id' <<<"$images_newest_first" |
  while read -r image_id; do
    printf 'Deleting %s...\n' "$image_id"
    "${VERCEL_COMMAND[@]}" image rm "$VCR_REPOSITORY" "$image_id" \
      "${VERCEL_TARGET_ARGS[@]}" \
      --yes
  done
