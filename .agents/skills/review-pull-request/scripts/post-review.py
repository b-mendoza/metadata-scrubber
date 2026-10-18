#!/usr/bin/env python3
# Usage: python3 -I post-review.py --dry-run RUN_DIR | --approved <sha256> RUN_DIR | --self-test | -h
# Paths: workspace-relative RUN_DIR; run from the workspace root, no .. or symlinks.
# Environment: PATH locates gh; GH_TOKEN/GITHUB_TOKEN or gh saved login (github.com).
# Exit: 0 posted/preview/help/test; 1 possible effect (POST_ERROR, never retry);
# 2 usage (REVIEW_ERROR); 3 refused before effects (POST_ERROR, draft kept).
# Side effects: approved posts review/replies and saves receipts.json via run-local render.tmp.
# Dry-run reads only. Never retry.
import contextlib
import hashlib
import io
import json
from pathlib import Path
import os
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch
from urllib.parse import quote, urlsplit

shared = runpy.run_path(str(Path(__file__).with_name("render-review.py")))
load, fixture = shared["load"], shared["fixture"]
USAGE = ("Usage: python3 -I post-review.py --dry-run RUN_DIR | --approved <sha256> RUN_DIR"
         " | --self-test | -h\n"
         "Paths: workspace-relative, from the workspace root; no .. or symlinks.\n"
         "Environment: PATH; GH_TOKEN/GITHUB_TOKEN or gh saved login (github.com).")

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))

def plan_for(run):
    context, author = load(run, "context.txt", "context"), load(run, "author.txt", "author")
    if context["state"] != "open" or context["history"] != "complete":
        raise ValueError("posting requires an open PR and complete history")
    threads = {t["root_comment_id"]: t for t in context["threads"]}
    comments, replies = [], []
    for finding in author["findings"]:
        placement = finding["placement"]
        if placement == "unknown":
            raise ValueError(f"{finding['id']}: unknown placement disables posting")
        if placement == "inline":
            comment = dict(finding["anchor"], body=finding["body"])
            if "start_line" in comment:
                comment["start_side"] = comment["side"]
            comments.append(comment)
        if placement == "reply":
            root = finding["root_comment_id"]
            if root not in threads:
                raise ValueError(f"{finding['id']}: reply target absent from context threads")
            replies.append(dict(root_comment_id=root, body=finding["body"]))
    owner, repo, _, number = context["pr"].removeprefix("https://github.com/").split("/")
    plan = dict(repo=owner + "/" + repo, number=int(number),
                base=context["base"], base_sha=context["base_sha"],
                review=dict(commit_id=context["head_sha"], event=author["decision"],
                            body=author["summary"], comments=comments), replies=replies)
    sha = hashlib.sha256(canonical(plan).encode()).hexdigest()
    return context, author, plan, sha

def preview(context, plan, sha):
    review = plan["review"]
    parts = [f"POST review to {plan['repo']}#{plan['number']}", "base: " + plan["base"],
             "merge-base: " + plan["base_sha"], "commit_id: " + review["commit_id"],
             "event: " + review["event"], "Summary body:", review["body"]]
    for comment in review["comments"]:
        location = {key: value for key, value in comment.items() if key != "body"}
        parts += ["Inline: " + canonical(location), comment["body"]]
    threads = {t["root_comment_id"]: t for t in context["threads"]}
    for reply in plan["replies"]:
        parts += [f"Reply to root {reply['root_comment_id']}: "
                  f"{threads[reply['root_comment_id']]['root_url']}", reply["body"]]
    print("\n\n".join(parts) + "\napproval-sha256: " + sha)

def gh(args, data=None):
    result = subprocess.run(["gh", *args], input=data, text=True, encoding="utf-8",
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError(f"gh exit {result.returncode}: {result.stderr.strip()}; outcome may be uncertain")
    return json.loads(result.stdout)

def receipt_for(result):
    identifier, url = result.get("id"), result.get("html_url")
    if (type(identifier) is not int or identifier < 1 or not isinstance(url, str) or
            urlsplit(url).scheme != "https" or not urlsplit(url).netloc):
        raise ValueError("invalid mutation receipt; outcome uncertain, never retry")
    return dict(id=identifier, url=url)

def save_receipts(path, receipts, create=False):
    if path.is_symlink() or (not create and not path.is_file()):
        raise ValueError("receipts path changed; refusing replacement")
    data = (json.dumps(receipts, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    expected = None if create else shared["digest"](shared["read_bytes"](path))
    shared["write_file"](path.parent, path, data, expected)

def execute(args, runner=gh, available=lambda: shutil.which("gh")):
    if args == ["-h"]:
        print(USAGE)
        return 0
    if args == ["--self-test"]:
        self_test()
        return 0
    dry = len(args) == 2 and args[0] == "--dry-run"
    approved = len(args) == 3 and args[0] == "--approved" and re.fullmatch(r"[0-9a-f]{64}", args[1])
    if not (dry or approved):
        print(USAGE, file=sys.stderr)
        return 2
    attempted = False
    try:
        run = Path(args[-1])
        context, author, plan, sha = plan_for(run)
        if dry:
            preview(context, plan, sha)
            return 0
        if args[1] != sha:
            raise ValueError("approval sha256 mismatch; preview changed")
        if not available():
            raise ValueError("gh CLI required")
        path = run / "receipts.json"
        if path.exists() or path.is_symlink():
            raise ValueError("receipts already exist; never retry a posting run")
        api = ["api", "--hostname", "github.com"]
        endpoint = f"repos/{plan['repo']}/pulls/{plan['number']}"
        live = runner([*api, endpoint])
        if (live.get("state") != "open" or live.get("head", {}).get("sha") != context["head_sha"] or
                live.get("base", {}).get("ref") != context["base"] or live.get("merged_at")):
            raise ValueError("live PR state/head/base changed; approval invalid")
        comparison = runner([*api, f"repos/{plan['repo']}/compare/"
                             f"{quote(context['base'], safe='')}...{context['head_sha']}"])
        if comparison.get("merge_base_commit", {}).get("sha") != context["base_sha"]:
            raise ValueError("live merge-base changed; approval invalid")
        receipts = dict(review=None, replies=[], failed=[], complete=False)
        save_receipts(path, receipts, create=True)
        current = dict(review="review")
        attempted = True
        result = runner([*api, "--method", "POST", endpoint + "/reviews", "--input", "-"],
                        canonical(plan["review"]))
        receipts["review"] = receipt_for(result)
        save_receipts(path, receipts)
        findings = [finding for finding in author["findings"] if finding["placement"] == "reply"]
        for finding, reply in zip(findings, plan["replies"]):
            current = dict(finding=finding["id"])
            result = runner([*api, "--method", "POST", endpoint +
                             f"/comments/{reply['root_comment_id']}/replies", "--input", "-"],
                            canonical(dict(body=reply["body"])))
            receipts["replies"].append(dict(finding=finding["id"], **receipt_for(result)))
            save_receipts(path, receipts)
        receipts["complete"] = True
        try:
            save_receipts(path, receipts)
        except (OSError, ValueError) as error:
            receipts["complete"] = False
            print("All GitHub actions posted; local completion receipt write failed: " +
                  str(error) + "; stop, never retry", file=sys.stderr)
            print(json.dumps(receipts, ensure_ascii=False), file=sys.stderr)
            return 1
        print(json.dumps(receipts, ensure_ascii=False))
        return 0
    except (ValueError, OSError, KeyError, TypeError, AttributeError) as error:
        if attempted:
            receipts["failed"] = [dict(current, detail=str(error) + "; stop, never retry")]
            try:
                save_receipts(path, receipts)
            except (OSError, ValueError) as receipt_error:
                print("Receipt write failed: " + str(receipt_error), file=sys.stderr)
            print(json.dumps(receipts, ensure_ascii=False), file=sys.stderr)
        print(str(error), file=sys.stderr)
        return 1 if attempted else 3

def self_test():
    tests = 0
    def invoke(args, runner=None, present=True):
        with contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as error:
            code = execute(
                args, runner or (lambda *a: (_ for _ in ()).throw(AssertionError("unexpected gh"))),
                lambda: present)
        return code, output.getvalue(), error.getvalue()
    cwd = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        try:
            os.chdir(directory)
            run = Path(".")
            context, author, body = fixture(run)
            def put(mode, value):
                (run / (mode + ".txt")).write_text(mode.upper() + ": PASS\n" + json.dumps(value),
                                                  encoding="utf-8")
            assert invoke(["--dry-run", str(Path.cwd())])[0] == 3
            tests += 1
            dry = ["--dry-run", "."]
            first = invoke(dry)
            assert first[0] == 0 and first == invoke(dry) and body in first[1]
            tests += 1
            sha = first[1].split("approval-sha256: ")[-1].strip()
            for key, value in [("base", "release"), ("base_sha", "c" * 40)]:
                put("context", dict(context, **{key: value}))
                assert plan_for(run)[3] != sha
                tests += 1
            put("context", context)
            assert "base: main" in first[1] and "merge-base: " + "a" * 40 in first[1]
            tests += 1
            author["findings"] += [dict(author["findings"][0], id="R", placement="reply", root_comment_id=7)]
            put("author", author)
            for target, key in [(author, "summary"), (author["findings"][0], "body"),
                                (author["findings"][1], "body")]:
                before = plan_for(run)[3]
                target[key] += "changed"
                put("author", author)
                assert plan_for(run)[3] != before
                tests += 1
            context, author, body = fixture(run)
            approved = ["--approved", sha, "."]
            for args, present in [(["--approved", "0" * 64, "."], True), (approved, False)]:
                assert invoke(args, present=present)[0] == 3
                tests += 1
            for change in [dict(state="closed"), dict(history="partial")]:
                put("context", dict(context, **change))
                assert invoke(dry)[0] == 3
                tests += 1
            put("context", context)
            finding = author["findings"][0]
            unknown = {key: value for key, value in finding.items() if key != "body"}
            for invalid in [dict(unknown, placement="unknown"),
                            dict(finding, placement="reply", root_comment_id=99)]:
                author["findings"] = [invalid]
                put("author", author)
                assert invoke(dry)[0] == 3
                tests += 1
            context, author, body = fixture(run)
            for runner in [lambda *a: dict(state="open", head=dict(sha="c" * 40), base=dict(ref="main")),
                           lambda *a: dict(state="closed", head=dict(sha=context["head_sha"]),
                                          base=dict(ref="main")),
                           lambda *a: (_ for _ in ()).throw(ValueError("gh exit 4: auth required"))]:
                assert invoke(approved, runner)[0] == 3
                tests += 1
            for base, merge_base in [("release", "a" * 40), ("main", "c" * 40), ("main", None)]:
                calls = []
                def preflight(args, data=None):
                    calls.append((args, data))
                    if len(calls) == 1:
                        return dict(state="open", head=dict(sha=context["head_sha"]),
                                    base=dict(ref=base, sha="c" * 40))
                    if "/compare/" in args[-1]:
                        if merge_base is None:
                            raise ValueError("simulated compare read failure")
                        return dict(merge_base_commit=dict(sha=merge_base))
                    return dict(id=1, html_url="https://github.com/receipt/1")
                assert invoke(approved, preflight)[0] == 3
                assert not (run / "receipts.json").exists()
                assert all("--method" not in args and data is None for args, data in calls)
                assert len(calls) == (1 if base == "release" else 2)
                if base == "main":
                    assert calls[1][0][-1] == "repos/cli/cli/compare/main..." + "b" * 40
                tests += 1
            for failure in (None, "reply", "receipt", "receipt-write"):
                author["findings"] = [finding, dict(finding, id="R1", placement="reply", root_comment_id=7)]
                context["threads"].append(dict(context["threads"][0], thread_id="thread2", root_comment_id=8,
                                              root_url="https://github.com/cli/cli/pull/1#discussion_r8"))
                author["findings"].append(dict(finding, id="R2", placement="reply", root_comment_id=8))
                put("context", context)
                put("author", author)
                calls = []
                def stub(args, data=None):
                    calls.append((args, data))
                    if len(calls) == 1:
                        return dict(state="open", head=dict(sha=context["head_sha"]),
                                    base=dict(ref=context["base"], sha="c" * 40))
                    if len(calls) == 2:
                        assert args[-1] == "repos/cli/cli/compare/main..." + "b" * 40
                        assert data is None and not (run / "receipts.json").exists()
                        return dict(merge_base_commit=dict(sha=context["base_sha"]))
                    if len(calls) == 3:
                        assert json.loads((run / "receipts.json").read_bytes()) == dict(
                            review=None, replies=[], failed=[], complete=False)
                    if failure == "reply" and len(calls) == 4:
                        raise ValueError("simulated reply failure")
                    return dict(id=len(calls), html_url="https://github.com/receipt/" + str(len(calls)))
                replace, fsync = os.replace, os.fsync
                def replace_stub(source, target):
                    if failure == "receipt" and json.loads(Path(source).read_bytes())["complete"]:
                        raise OSError("simulated final receipt replacement failure")
                    return replace(source, target)
                def fsync_stub(fd):
                    temporary = run / "render.tmp"
                    if (failure == "receipt-write" and temporary.is_file() and
                            json.loads(temporary.read_bytes())["complete"]):
                        raise OSError("simulated final receipt flush failure")
                    return fsync(fd)
                current_sha = invoke(dry)[1].split("approval-sha256: ")[-1].strip()
                with patch.object(os, "replace", replace_stub), patch.object(os, "fsync", fsync_stub):
                    result = invoke(["--approved", current_sha, "."], stub)
                assert result[0] == (1 if failure else 0)
                receipts = json.loads((run / "receipts.json").read_bytes())
                assert receipts["review"]["id"] == 3 and calls[2][0][-2:] == ["--input", "-"]
                assert json.loads(calls[2][1])["body"] == body and json.loads(calls[3][1])["body"] == body
                assert json.loads(calls[2][1])["comments"][0] == dict(finding["anchor"], body=body,
                                                                 start_side="RIGHT")
                assert (len(receipts["replies"]) == (0 if failure == "reply" else 2) and
                        bool(receipts["failed"]) == (failure == "reply"))
                assert receipts["complete"] is (not failure)
                assert not (run / "render.tmp").exists()
                if failure in ("receipt", "receipt-write"):
                    assert "All GitHub actions posted; local completion receipt write failed" in result[2]
                    assert "never retry" in result[2]
                assert len(calls) == (4 if failure == "reply" else 5)
                assert calls[3][0][-3].endswith("/comments/7/replies")
                assert failure == "reply" or calls[4][0][-3].endswith("/comments/8/replies")
                assert invoke(["--approved", current_sha, "."])[0] == 3
                (run / "receipts.json").unlink()
                context, author, body = fixture(run)
                tests += 2
        finally:
            os.chdir(cwd)
    print(f"post-review: {tests}/{tests} tests passed")

if __name__ == "__main__":
    sys.exit(execute(sys.argv[1:]))
