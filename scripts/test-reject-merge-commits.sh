#!/bin/sh
# Test the pre-push hook with pushes to temporary bare repositories.
set -eu

hook=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)/.lefthook/pre-push/reject-merge-commits

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM

# Keep user settings, templates, and repository overrides out of the tests.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_CONFIG_PARAMETERS
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_COUNT=4
export GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0='Hook Test'
export GIT_CONFIG_KEY_1=user.email GIT_CONFIG_VALUE_1=hook-test@example.invalid
export GIT_CONFIG_KEY_2=init.defaultBranch GIT_CONFIG_VALUE_2=main
export GIT_CONFIG_KEY_3=init.templateDir GIT_CONFIG_VALUE_3=
export GIT_TERMINAL_PROMPT=0 GIT_MERGE_AUTOEDIT=no

# Build one remote, a source repository, and a clone with the hook installed.
setup() {
  origin=$case_dir/origin.git
  seed=$case_dir/seed
  work=$case_dir/work
  git init --bare "$origin"
  git init "$seed"
  git -C "$seed" commit --allow-empty -m base
  git -C "$seed" remote add origin "$origin"
  git -C "$seed" push origin main
  git clone "$origin" "$work"
  mkdir -p "$work/.git/hooks"
  cp "$hook" "$work/.git/hooks/pre-push"
  chmod +x "$work/.git/hooks/pre-push"
}

failed=0
for name in rebase other-remote unfetched-lease new-linear new-merge existing-merge url-merge tag-and-deletion; do
  case_dir=$tmp/$name
  mkdir "$case_dir"
  # Run each case as a separate process. A setup error must fail that case.
  # The case runs in the background and the loop waits for it. A subshell in
  # an if condition would turn off set -e.
  (
    setup
    case "$name" in
      rebase)
        git -C "$work" switch -c feature
        git -C "$work" commit --allow-empty -m feature
        git -C "$work" push origin feature
        git -C "$seed" switch -c upstream-side
        git -C "$seed" commit --allow-empty -m upstream-side
        git -C "$seed" switch main
        git -C "$seed" commit --allow-empty -m upstream-main
        git -C "$seed" merge --no-ff upstream-side -m upstream-merge
        git -C "$seed" push origin main
        git -C "$work" fetch origin
        git -C "$work" rebase origin/main
        git -C "$work" push --force-with-lease origin feature
        test "$(git --git-dir="$origin" rev-parse refs/heads/feature)" = "$(git -C "$work" rev-parse HEAD)"
        ;;
      other-remote)
        other=$case_dir/other.git
        git init --bare "$other"
        git -C "$seed" switch -c foreign-side
        git -C "$seed" commit --allow-empty -m foreign-side
        git -C "$seed" switch -c foreign main
        git -C "$seed" commit --allow-empty -m foreign-main
        git -C "$seed" merge --no-ff foreign-side -m foreign-merge
        git -C "$seed" push "$other" foreign
        git -C "$work" remote add other "$other"
        git -C "$work" fetch other
        git -C "$work" switch -c foreign other/foreign
        if git -C "$work" push origin foreign >"$case_dir/push.log" 2>&1; then
          echo 'The push accepted a merge from another remote.' >&2
          exit 1
        fi
        grep -F 'Push blocked. These commits are merge commits:' "$case_dir/push.log"
        if git --git-dir="$origin" show-ref --verify --quiet refs/heads/foreign; then
          echo 'The destination has the rejected branch.' >&2
          exit 1
        fi
        ;;
      unfetched-lease)
        second=$case_dir/second
        git clone "$origin" "$second"
        mkdir -p "$second/.git/hooks"
        cp "$hook" "$second/.git/hooks/pre-push"
        chmod +x "$second/.git/hooks/pre-push"
        git -C "$second" commit --allow-empty -m second-clone
        git -C "$second" push origin main
        tip=$(git -C "$second" rev-parse HEAD)
        git -C "$work" commit --allow-empty -m rewritten-main
        if git -C "$work" cat-file -e "${tip}^{commit}" 2>/dev/null; then
          echo 'The first clone has the tip that it must not have fetched.' >&2
          exit 1
        fi
        git -C "$work" push "--force-with-lease=refs/heads/main:$tip" origin main
        test "$(git --git-dir="$origin" rev-parse refs/heads/main)" = "$(git -C "$work" rev-parse HEAD)"
        ;;
      new-linear)
        git -C "$seed" switch -c upstream-side
        git -C "$seed" commit --allow-empty -m upstream-side
        git -C "$seed" switch main
        git -C "$seed" commit --allow-empty -m upstream-main
        git -C "$seed" merge --no-ff upstream-side -m upstream-merge
        git -C "$seed" push origin main
        git -C "$work" fetch origin
        git -C "$work" switch -c linear origin/main
        git -C "$work" commit --allow-empty -m linear
        git -C "$work" push origin linear
        test "$(git --git-dir="$origin" rev-parse refs/heads/linear)" = "$(git -C "$work" rev-parse HEAD)"
        ;;
      new-merge)
        git -C "$work" switch -c side
        git -C "$work" commit --allow-empty -m side
        git -C "$work" switch -c feature main
        git -C "$work" commit --allow-empty -m feature
        git -C "$work" merge --no-ff side -m new-merge
        if git -C "$work" push origin feature >"$case_dir/push.log" 2>&1; then
          echo 'The push accepted a new merge.' >&2
          exit 1
        fi
        grep -F 'Push blocked. These commits are merge commits:' "$case_dir/push.log"
        if git --git-dir="$origin" show-ref --verify --quiet refs/heads/feature; then
          echo 'The destination has the rejected branch.' >&2
          exit 1
        fi
        ;;
      existing-merge)
        git -C "$work" switch -c feature
        git -C "$work" commit --allow-empty -m feature
        git -C "$work" push origin feature
        before=$(git --git-dir="$origin" rev-parse refs/heads/feature)
        git -C "$work" switch -c side
        git -C "$work" commit --allow-empty -m side
        git -C "$work" switch feature
        git -C "$work" commit --allow-empty -m next-feature
        git -C "$work" merge --no-ff side -m appended-merge
        if git -C "$work" push origin feature >"$case_dir/push.log" 2>&1; then
          echo 'The push accepted an appended merge.' >&2
          exit 1
        fi
        grep -F 'Push blocked. These commits are merge commits:' "$case_dir/push.log"
        test "$(git --git-dir="$origin" rev-parse refs/heads/feature)" = "$before"
        ;;
      url-merge)
        git -C "$work" switch -c side
        git -C "$work" commit --allow-empty -m side
        git -C "$work" switch main
        git -C "$work" commit --allow-empty -m next-main
        git -C "$work" merge --no-ff side -m url-merge
        if git -C "$work" push "$origin" HEAD:refs/heads/x >"$case_dir/push.log" 2>&1; then
          echo 'The push by URL accepted a new merge.' >&2
          exit 1
        fi
        grep -F 'Push blocked. These commits are merge commits:' "$case_dir/push.log"
        if git --git-dir="$origin" show-ref --verify --quiet refs/heads/x; then
          echo 'The destination has the rejected branch.' >&2
          exit 1
        fi
        ;;
      tag-and-deletion)
        git -C "$work" push origin HEAD:refs/heads/deletable
        git -C "$work" switch -c side
        git -C "$work" commit --allow-empty -m side
        git -C "$work" switch main
        git -C "$work" commit --allow-empty -m next-main
        git -C "$work" merge --no-ff side -m tagged-merge
        git -C "$work" tag merge-tag
        git -C "$work" push origin refs/tags/merge-tag
        test "$(git --git-dir="$origin" rev-parse refs/tags/merge-tag)" = "$(git -C "$work" rev-parse HEAD)"
        git -C "$work" push origin --delete deletable
        if git --git-dir="$origin" show-ref --verify --quiet refs/heads/deletable; then
          echo 'The destination still has the deleted branch.' >&2
          exit 1
        fi
        ;;
    esac
  ) >"$case_dir/case.log" 2>&1 &
  pid=$!
  if wait "$pid"; then
    printf 'ok %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    cat "$case_dir/case.log" >&2
    failed=1
  fi
done
exit "$failed"
