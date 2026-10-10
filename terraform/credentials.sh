#!/bin/sh
set -eu
umask 077

for command in pnpm jq curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s. Install it and run credentials again.\n' "$command" >&2
    exit 1
  fi
done

script_dir=$(CDPATH='' cd -P "$(dirname "$0")" && pwd)
version=$(jq -er '.devDependencies.wrangler | select(type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' "$script_dir/../backend/package.json")
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL CF_API_TOKEN CF_API_KEY CF_EMAIL
# Wrangler loads dotenv itself and can write auth token output to its debug log.
export WRANGLER_WRITE_LOGS=false WRANGLER_LOG=log
pnpm dlx --allow-build=esbuild --allow-build=workerd "wrangler@$version" login --env-file /dev/null

if ! auth=$(pnpm dlx --allow-build=esbuild --allow-build=workerd "wrangler@$version" auth token --profile default --json --env-file /dev/null 2>/dev/null) ||
  ! token=$(printf '%s' "$auth" | jq -er 'select(.type == "oauth") | .token | select(type == "string" and length > 0 and (test("[[:cntrl:]]") | not))' 2>/dev/null); then
  printf 'Could not read the OAuth token after login. Run credentials again.\n' >&2
  exit 1
fi

# whoami rejects --profile. Check that its active token is the fresh default token.
if ! active_auth=$(pnpm dlx --allow-build=esbuild --allow-build=workerd "wrangler@$version" auth token --json --env-file /dev/null 2>/dev/null) || [ "$active_auth" != "$auth" ]; then
  printf 'This directory must use the Wrangler default profile. Remove its named profile binding and run credentials again.\n' >&2
  exit 1
fi

if ! identity=$(pnpm dlx --allow-build=esbuild --allow-build=workerd "wrangler@$version" whoami --json --env-file /dev/null 2>/dev/null) ||
  ! account_id=$(printf '%s' "$identity" | jq -er 'select(.loggedIn == true and (.accounts | length) == 1) | .accounts[0].id | select(type == "string" and test("^[a-fA-F0-9]{32}$"))' 2>/dev/null); then
  printf 'Wrangler must be logged in to exactly one Cloudflare account.\n' >&2
  exit 1
fi

printf 'Enter the parent access key ID for the state bucket: ' >&2
if ! IFS= read -r parent_access_key_id || [ -z "$parent_access_key_id" ]; then
  printf 'The parent access key ID is required.\n' >&2
  exit 1
fi
request=$(printf '%s' "$parent_access_key_id" | jq -Rsc '{bucket: "metadata-scrubber-terraform-state", parentAccessKeyId: ., permission: "object-read-write", ttlSeconds: 3600}')
expiry=$(jq -nr 'now + 3600 | floor | todateiso8601')

# Read the authorization header from stdin, not the process arguments.
if ! response=$(
  printf '%s' "$token" |
    jq -Rr '"header = " + ("Authorization: Bearer " + . | @json)' |
    curl -q --silent --fail-with-body --config - \
      --header 'Content-Type: application/json' \
      --data "$request" \
      "https://api.cloudflare.com/client/v4/accounts/$account_id/r2/temp-access-credentials" 2>/dev/null
) || ! printf '%s' "$response" | jq -e '.success == true' >/dev/null 2>&1; then
  errors=$(printf '%s' "$response" | jq -r '.errors[]? | "\(.code): \(.message)"' 2>/dev/null) || errors=''
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors" >&2
  else
    printf 'Could not obtain temporary R2 credentials. The .env file was not changed.\n' >&2
  fi
  exit 1
fi

output=$(mktemp "$script_dir/.env.XXXXXX")
trap 'rm -f "$output"' EXIT
trap 'exit 1' HUP INT TERM
# Single quotes stop dotenv expansion. Reject values that cannot stay literal.
if ! printf '%s\n' "$auth" "$identity" "$response" | jq -ser --arg quote "'" '
  {
    CLOUDFLARE_API_TOKEN: .[0].token,
    TF_VAR_cloudflare_account_id: .[1].accounts[0].id,
    AWS_ENDPOINT_URL_S3: ("https://" + .[1].accounts[0].id + ".r2.cloudflarestorage.com"),
    AWS_ACCESS_KEY_ID: .[2].result.accessKeyId,
    AWS_SECRET_ACCESS_KEY: .[2].result.secretAccessKey,
    AWS_SESSION_TOKEN: .[2].result.sessionToken
  }
  | if all(.[]; type == "string" and length > 0 and (test("[[:cntrl:]]") | not) and (contains($quote) | not)) then
      to_entries[] | "\(.key)=\($quote)\(.value)\($quote)"
    else error("Invalid credential values") end
' > "$output" 2>/dev/null; then
  printf 'Cloudflare returned invalid credential values. The .env file was not changed.\n' >&2
  exit 1
fi
chmod 600 "$output"
mv -f "$output" "$script_dir/.env"
printf 'Updated CLOUDFLARE_API_TOKEN, TF_VAR_cloudflare_account_id, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN.\n'
printf 'Estimated R2 expiry: %s\n' "$expiry"
