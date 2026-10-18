#!/usr/bin/env python3
# Usage: python3 -I render-review.py RUN_DIR OUTPUT_FILE [--replace <sha256>] | --self-test | -h
# Paths: workspace-relative RUN_DIR/OUTPUT_FILE; run from the workspace root, no .. or symlinks.
# Environment: none. Python 3 stdlib only; use isolated mode (-I).
# Exit: 0 written/help/test; 1 refused/invalid input (WRITE_ERROR); 2 usage (REVIEW_ERROR).
# Side effects: creates output exclusively or stages digest-guarded replacement in RUN_DIR/render.tmp.
# Check, temp files only: python3 -I render-review.py --self-test
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from unittest.mock import patch

USAGE = ("Usage: python3 -I render-review.py RUN_DIR OUTPUT_FILE [--replace <sha256>] | --self-test | -h\n"
         "Paths: workspace-relative, from the workspace root; no .. or symlinks.\nEnvironment: none.")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(path):
    path = Path(path)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"{path}: expected workspace-relative path without .. components")
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError(f"{path}: symlinks refused")
    return path


def read_bytes(path):
    path = safe_path(path)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise ValueError(f"{path}: expected regular file")
        return stream.read()


def load(run, name, mode):
    data = read_bytes(Path(run) / name)
    checked = subprocess.run(
        [sys.executable, "-I", str(Path(__file__).with_name("validate-output.py")), mode],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if checked.returncode:
        raise ValueError((checked.stdout + checked.stderr).decode("utf-8", errors="replace").rstrip())
    status, _, body = data.decode("utf-8").partition("\n")
    if status != f"{mode.upper()}: PASS":
        raise ValueError(f"{name}: expected {mode.upper()}: PASS")
    return json.loads(body)


def write_file(run, path, data, expected=None):
    path = safe_path(path)
    if expected is None:
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600),
                       "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        return digest(data)
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or digest(read_bytes(path)) != expected:
        raise ValueError(f"{path}: replacement sha256 mismatch")
    temporary = safe_path(Path(run) / "render.tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if digest(read_bytes(path)) != expected:
            raise ValueError(f"{path}: replacement basis changed")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return digest(data)


def render(run):
    context = load(run, "context.txt", "context")
    chunks = [load(run, f"chunk-{d['name']}.txt", "chunk") for d in context["dimensions"]]
    author, verify = load(run, "author.txt", "author"), load(run, "verify.txt", "verify")
    for dimension, chunk in zip(context["dimensions"], chunks):
        if dimension["name"] != chunk["dimension"]:
            raise ValueError(f"chunk-{dimension['name']}.txt: dimension mismatch")
    threads = {t["root_comment_id"]: t for t in context["threads"]}
    state = context["state"] + (" (historical assessment)" if context["state"] != "open" else "")
    parts = [f"# PR review: {context['title']}", f"PR: {context['pr']}", f"PR state: {state}",
             "Dimensions reviewed: " + ", ".join(d["name"] for d in context["dimensions"]),
             f"Reviewed base: {context['base_sha']}", f"Reviewed head: {context['head_sha']}", "## Findings"]
    for finding in author["findings"]:
        parts += [f"### [{finding['severity']}] {finding['title']}",
                  f"ID: {finding['id']}\nConfidence: {finding['confidence']}\n"
                  f"Placement: {finding['placement']}"]
        anchor = finding["anchor"]
        if anchor:
            lines = (f"{anchor['start_line']}-{anchor['line']}" if "start_line" in anchor
                     else str(anchor["line"]))
            parts.append(f"Anchor: {anchor['path']}:{lines} {anchor['side']}")
        for key, label in [("evidence", "Evidence"), ("failure_scenario", "Failure scenario"),
                           ("minimal_fix", "Fix")]:
            parts += [label + ":", finding[key]]
        parts += ["Sources:", "\n".join(finding["sources"]) or "None."]
        if finding["placement"] == "reply":
            if finding["root_comment_id"] not in threads:
                raise ValueError(f"{finding['id']}: reply target absent from context")
            parts.append("Reply target: " + threads[finding["root_comment_id"]]["root_url"])
        if "body" in finding:
            parts += ["Exact body:", finding["body"]]
    if not author["findings"]:
        parts.append("No findings in the inspected scope. This is not proof of correctness.")
    parts += ["## Dropped candidates"] + [f"{d['candidate']}: {d['reason']}" for d in author["dropped"]]
    if not author["dropped"]:
        parts.append("None.")
    parts += ["## Review decision", author["decision"], "## Review summary", author["summary"], "## Coverage"]
    for chunk in chunks:
        parts.append("### " + chunk["dimension"])
        parts += [f"Inspected: {s['path']} {s['ranges']}" for s in chunk["inspected"]]
        parts += [f"Gap: {g['path']} ({g['kind']}): {g['detail']}" for g in chunk["gaps"]]
    parts += ["History: " + context["history"]] + context["limitations"] + ["## Residual risks"]
    risks = [risk for chunk in chunks for risk in chunk["residual_risks"]] + author["residual_risks"]
    parts += risks or ["None."]
    parts += (["## Verification notes"] + verify["observed_checks"] +
              ["CI as observed at collection:", context["ci"], "## Posting"])
    receipt = safe_path(Path(run) / "receipts.json")
    if receipt.exists():
        receipts = json.loads(read_bytes(receipt))
        parts += ["Review: " + json.dumps(receipts["review"], ensure_ascii=False)]
        parts += ["Reply: " + json.dumps(reply, ensure_ascii=False) for reply in receipts["replies"]]
        parts += ["Failed/uncertain: " + json.dumps(failure, ensure_ascii=False)
                  for failure in receipts["failed"]]
        if receipts.get("complete") is not True:
            parts.append("Posting is incomplete. An action without a receipt may still have taken effect "
                         "on GitHub. Check the PR before any manual follow-up; never re-run the poster.")
    else:
        parts.append("Not posted.")
    return ("\n\n".join(parts) + "\n").encode("utf-8")


def fixture(run):
    body = "Exact body  \n\n```suggestion\nnew value  \n```\n\nTrailing spaces  \n"
    context = dict(pr="https://github.com/cli/cli/pull/1", state="open", title="Fixture", author="someone",
                   base="main", head="fix", base_sha="a" * 40, head_sha="b" * 40, shortstat="",
                   changed_files=["file.py"], ci="Not run; collected at fixture time",
                   linked_context="", test_signals="", behavior_summary="Fixture behavior", risk_areas=[],
                   dimensions=[dict(name="correctness", files=["file.py"], rationale="Changed logic")],
                   history="complete", threads=[dict(thread_id="thread", is_resolved=False, path="file.py",
                   line=1, root_comment_id=7, root_url="https://github.com/cli/cli/pull/1#discussion_r7",
                   summary="Existing")], feedback=[], references=[], limitations=[])
    finding = dict(id="F1", severity="important", title="Fix this", confidence="high",
                   anchor=dict(path="file.py", line=2, side="RIGHT", start_line=1), evidence="Evidence  \n",
                   failure_scenario="Failure", minimal_fix="Fix", sources=[], placement="inline", body=body)
    author = dict(decision="REQUEST_CHANGES", summary=body, findings=[finding], dropped=[],
                  residual_risks=[], references=[])
    chunk = dict(dimension="correctness", inspected=[dict(path="file.py", ranges="1-2")], gaps=[],
                 findings=[], residual_risks=[], references=[])
    for mode, name, value in [("context", "context.txt", context), ("chunk", "chunk-correctness.txt", chunk),
                              ("author", "author.txt", author),
                              ("verify", "verify.txt", dict(issues=[], observed_checks=["Fixture only"]))]:
        (Path(run) / name).write_bytes((mode.upper() + ": PASS\n" + json.dumps(value)).encode())
    return context, author, body


def self_test():
    tests = 0
    def refused(action):
        try:
            action()
        except (ValueError, OSError):
            return
        raise AssertionError("expected refusal")
    cwd = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        try:
            os.chdir(directory)
            run = Path(".")
            context, author, body = fixture(run)
            data = render(run)
            assert body.encode() in data and b"file.py:1-2 RIGHT" in data
            assert data.rsplit(b"## Posting\n", 1)[1] == b"\nNot posted.\n"
            tests += 1
            output = run / "review.md"
            sha = write_file(run, output, data)
            assert sha == digest(data) and output.read_bytes() == data
            tests += 1
            link = run / "link.md"
            link.symlink_to(output)
            linked_dir = run / "linked-dir"
            linked_dir.symlink_to(Path.cwd(), target_is_directory=True)
            for target, expected in [(output, None), (link, None), (link, sha),
                                     (linked_dir / "new.md", None), (output, "0" * 64),
                                     (Path.cwd() / "absolute.md", None), (Path("../new.md"), None)]:
                refused(lambda: write_file(run, target, b"no", expected))
                tests += 1
            temporary = run / "render.tmp"
            temporary.write_bytes(b"keep")
            refused(lambda: write_file(run, output, data, sha))
            assert temporary.read_bytes() == b"keep" and output.read_bytes() == data
            temporary.unlink()
            tests += 1
            with patch("os.replace", side_effect=OSError("cross-device replacement refused")):
                refused(lambda: write_file(run, output, data + b"updated", sha))
            assert not temporary.exists() and output.read_bytes() == data
            tests += 1
            assert write_file(run, output, data + b"updated", sha) == digest(data + b"updated")
            assert not temporary.exists()
            tests += 1
            receipts = dict(review=dict(id=9, url="https://github.com/cli/cli/pull/1#pullrequestreview-9"),
                            replies=[], failed=[], complete=True)
            (run / "receipts.json").write_text(json.dumps(receipts))
            posting = render(run).rsplit(b"## Posting\n", 1)[1]
            assert b"pullrequestreview-9" in posting and b"Posting is incomplete." not in posting
            tests += 1
            warning = (b"Posting is incomplete. An action without a receipt may still have taken effect on GitHub. "
                       b"Check the PR before any manual follow-up; never re-run the poster.")
            for complete in (False, None):
                receipts["complete"] = complete
                if complete is None:
                    del receipts["complete"]
                (run / "receipts.json").write_text(json.dumps(receipts))
                posting = render(run).rsplit(b"## Posting\n", 1)[1]
                assert warning in posting.splitlines() and b"pullrequestreview-9" in posting
                tests += 1
            (run / "chunk-correctness.txt").unlink()
            refused(lambda: render(run))
            tests += 1
            fixture(run)
            (run / "verify.txt").write_text('VERIFY: FAIL\n{"issues":["Not verified"],"observed_checks":[]}')
            refused(lambda: render(run))
            tests += 1
        finally:
            os.chdir(cwd)
    print(f"render-review: {tests}/{tests} tests passed")


def main(args):
    if args == ["-h"]:
        print(USAGE)
        return 0
    if args == ["--self-test"]:
        self_test()
        return 0
    if (len(args) not in (2, 4) or
            (len(args) == 4 and (args[2] != "--replace" or not re.fullmatch(r"[0-9a-f]{64}", args[3])))):
        print(USAGE, file=sys.stderr)
        return 2
    try:
        sha = write_file(args[0], args[1], render(args[0]), args[3] if len(args) == 4 else None)
        print("sha256: " + sha)
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
