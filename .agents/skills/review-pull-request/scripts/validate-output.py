#!/usr/bin/env python3
# Proves envelope, exact JSON keys/types, enums, identities and declared cross-field constraints.
# Does not prove evidence, coverage, review quality, live identity, approval or external effects.
# Usage: python3 -I validate-output.py <context|chunk|author|verify> < payload
#        python3 -I validate-output.py --self-test | -h
# Exit 0 conforms; 1 one "<mode>: line N: <message>" finding per defect (repair);
#      2 bad/missing mode or invocation (ERROR). Missing python3 is the caller's TOOLS_MISSING.
# Side effects: none. Environment: none. Check: python3 -I validate-output.py --self-test
import copy
import json
import re
import subprocess
import sys
from urllib.parse import urlsplit

MODES = ("context", "chunk", "author", "verify")
FAILURES = ("NEEDS_CONTEXT", "TOOLS_MISSING", "ERROR")
USAGE = ("Usage: python3 -I validate-output.py <context|chunk|author|verify> < payload\n"
         "       python3 -I validate-output.py --self-test | -h\n"
         "Exit 0 conforms; 1 defects (repair); 2 bad invocation (ERROR).\n"
         "Missing python3: caller's TOOLS_MISSING. Side effects: none. Environment: none.")

def text(value):
    return isinstance(value, str) and bool(value.strip())

def positive(value):
    return type(value) is int and value >= 1

def url(value):
    try:
        parsed = urlsplit(value) if text(value) else None
        return bool(parsed and parsed.scheme == "https" and parsed.hostname
                    and not any(char.isspace() for char in value) and parsed.port != 0)
    except ValueError:
        return False

def validate(mode, raw):
    errors = []
    def check(condition, path, message, line=2):
        if not condition:
            errors.append(f"{mode}: line {line}: {path or '$'}: {message}")
    def location(path, key):
        key = json.dumps(key, ensure_ascii=True)[1:-1]
        return f"{path}.{key}" if path else key
    def record(value, path, strings, others="", optional=""):
        if not isinstance(value, dict):
            check(False, path, "expected object")
            return {}
        keys = set((strings + " " + others).split())
        for key in sorted((keys - value.keys()) | (value.keys() - keys - set(optional.split()))):
            check(False, location(path, key), "extra key" if key in value else "missing key")
        fields(value, strings, path)
        return value
    def fields(data, keys, path="", predicate=text, message="expected non-empty string"):
        for key in keys.split():
            if key in data:
                check(predicate(data[key]), location(path, key), message)
    def array(data, key, path="", predicate=None, message="expected non-empty string"):
        value, path = data.get(key, []), location(path, key)
        check(isinstance(value, list), path, "expected array")
        if not isinstance(value, list):
            return []
        if predicate:
            for index, item in enumerate(value):
                check(predicate(item), f"{path}[{index}]", message)
        return value
    def records(values, key, strings, others=""):
        return [(record(value, f"{key}[{i}]", strings, others), f"{key}[{i}]")
                for i, value in enumerate(values)]
    def unique(values, path, key=None):
        identities = [row.get(key) if isinstance(row, dict) else None for row in values] if key else values
        for index, identity in enumerate(identities):
            target = location(f"{path}[{index}]", key) if key else f"{path}[{index}]"
            check(identity is None or identity not in identities[:index], target, "duplicate value")
    def enum(data, key, choices, path=""):
        fields(data, key, path, lambda value: value in choices, "expected one of " + ", ".join(choices))
    def findings(data, authored=False):
        values = array(data, "findings")
        unique(values, "findings", "id")
        if authored:
            unique(values, "findings", "root_comment_id")
        for index, value in enumerate(values):
            path = f"findings[{index}]"
            strings = "id title evidence failure_scenario minimal_fix"
            others = "severity confidence anchor sources"
            placement = value.get("placement") if isinstance(value, dict) else None
            if authored:
                others += " placement" + (" root_comment_id" if placement == "reply" else "")
                strings += " body" if placement in ("inline", "reply") else ""
            value = record(value, path, strings, others)
            if not authored and text(data.get("dimension")) and text(value.get("id")):
                check(re.fullmatch(re.escape(data["dimension"]) + r"-[1-9][0-9]*", value["id"]),
                      path + ".id", "expected dimension-N id (N >= 1)")
            enum(value, "severity", ("blocking", "important", "nit", "suggestion"), path)
            enum(value, "confidence", ("high", "medium", "low"), path)
            array(value, "sources", path, url, "expected HTTPS URL with host")
            if value.get("anchor") is not None:
                target = path + ".anchor"
                anchor = record(value["anchor"], target, "path", "line side", "start_line")
                fields(anchor, "line start_line", target, positive, "expected integer >= 1")
                enum(anchor, "side", ("RIGHT", "LEFT"), target)
                if positive(anchor.get("start_line")) and positive(anchor.get("line")):
                    check(anchor["start_line"] < anchor["line"], target + ".start_line", "must be < line")
            if authored:
                enum(value, "placement", ("inline", "reply", "summary", "unknown"), path)
                if placement == "inline" and "anchor" in value:
                    check(value["anchor"] is not None, path + ".anchor", "inline requires non-null anchor")
                if placement == "reply":
                    fields(value, "root_comment_id", path, positive, "expected integer >= 1")
    def unpack(value, path=""):
        if isinstance(value, tuple):
            result = {}
            for key, item in value:
                check(key not in result, location(path, key), "duplicate key")
                result[key] = unpack(item, location(path, key))
            return result
        if isinstance(value, list):
            return [unpack(item, f"{path}[{index}]") for index, item in enumerate(value)]
        return value
    def invalid_constant(value):
        raise ValueError("invalid JSON constant " + value)

    try:
        payload = raw.decode("utf-8")
        header, _, body = payload.partition("\n")
        statuses = ("PASS",) + (("FAIL",) if mode == "verify" else ()) + FAILURES
        status = header.removeprefix(mode.upper() + ": ")
        check(header == mode.upper() + ": " + status and status in statuses,
              "envelope", "expected " + mode.upper() + ": " + "|".join(statuses), 1)
        data = unpack(json.loads(body, object_pairs_hook=tuple, parse_constant=invalid_constant))
    except UnicodeDecodeError as error:
        check(False, "$", "invalid UTF-8", raw[:error.start].count(b"\n") + 1)
        return errors
    except json.JSONDecodeError as error:
        check(False, "$", error.msg, error.lineno + 1)
        return errors
    except (ValueError, RecursionError) as error:
        check(False, "$", "invalid JSON: " + str(error))
        return errors
    if not isinstance(data, dict):
        check(False, "$", "expected object")
        return errors
    if status in FAILURES:
        record(data, "", "reason next_step")
        return errors
    if mode == "context":
        record(data, "", "title author base head ci behavior_summary",
               "pr state base_sha head_sha shortstat changed_files linked_context test_signals risk_areas "
               "dimensions history threads feedback references limitations")
        fields(data, "shortstat linked_context test_signals", predicate=lambda v: isinstance(v, str),
               message="expected string")
        fields(data, "base_sha head_sha", predicate=lambda v: isinstance(v, str)
               and re.fullmatch(r"[0-9a-f]{40}", v), message="expected lowercase SHA (40 hex)")
        fields(data, "pr", predicate=lambda v: isinstance(v, str) and re.fullmatch(
            r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[1-9][0-9]*", v),
            message="expected canonical GitHub PR URL")
        enum(data, "state", ("open", "closed", "merged"))
        enum(data, "history", ("complete", "partial", "unknown"))
        changed = array(data, "changed_files", predicate=text)
        unique(changed, "changed_files")
        dimensions = array(data, "dimensions")
        if isinstance(data.get("dimensions"), list):
            check(1 <= len(dimensions) <= 6, "dimensions", "expected 1..6 items")
        unique(dimensions, "dimensions", "name")
        for value, path in records(dimensions, "dimensions", "rationale", "name files"):
            fields(value, "name", path, lambda v: isinstance(v, str) and re.fullmatch(r"[a-z][a-z0-9-]*", v),
                   "expected dimension name matching ^[a-z][a-z0-9-]*$")
            files = array(value, "files", path, text)
            if isinstance(value.get("files"), list):
                check(bool(files), path + ".files", "expected non-empty array")
            for index, name in enumerate(files):
                check(name in changed, f"{path}.files[{index}]", "not in changed_files")
        threads = array(data, "threads")
        unique(threads, "threads", "root_comment_id")
        for value, path in records(threads, "threads", "thread_id path summary",
                                   "is_resolved line root_comment_id root_url"):
            fields(value, "is_resolved", path, lambda v: type(v) is bool, "expected boolean")
            fields(value, "line", path, lambda v: v is None or positive(v), "expected integer >= 1 or null")
            fields(value, "root_comment_id", path, positive, "expected integer >= 1")
            fields(value, "root_url", path, url, "expected HTTPS URL with host")
        for value, path in records(array(data, "feedback"), "feedback", "summary", "kind url"):
            enum(value, "kind", ("review-summary", "discussion"), path)
            fields(value, "url", path, url, "expected HTTPS URL with host")
    elif mode == "chunk":
        record(data, "", "dimension", "inspected gaps findings residual_risks references")
        inspected, gaps = array(data, "inspected"), array(data, "gaps")
        if all(isinstance(data.get(key), list) for key in ("inspected", "gaps")):
            check(bool(inspected or gaps), "inspected/gaps", "must not both be empty")
        records(inspected, "inspected", "path ranges")
        for value, path in records(gaps, "gaps", "path detail", "kind"):
            enum(value, "kind", ("unavailable", "truncated", "binary", "omitted"), path)
        findings(data)
    elif mode == "author":
        record(data, "", "summary", "decision findings dropped residual_risks references")
        enum(data, "decision", ("COMMENT", "REQUEST_CHANGES", "APPROVE"))
        findings(data, authored=True)
        if isinstance(data.get("findings"), list):
            check(data.get("decision") != "REQUEST_CHANGES" or bool(data["findings"]), "findings",
                  "REQUEST_CHANGES requires at least one finding")
        records(array(data, "dropped"), "dropped", "candidate reason")
    elif mode == "verify":
        record(data, "", "", "issues observed_checks")
        issues = array(data, "issues", predicate=text)
        if isinstance(data.get("issues"), list):
            check(bool(issues) == (status == "FAIL"), "issues", "must be empty on PASS and non-empty on FAIL")
        array(data, "observed_checks", predicate=text)
    if mode in ("context", "chunk", "author"):
        for key in (("risk_areas", "limitations") if mode == "context" else ("residual_risks",)):
            array(data, key, predicate=text)
        array(data, "references", predicate=url, message="expected HTTPS URL with host")
    return errors

def self_test():
    finding = dict(id="c1", severity="blocking", title="Guard", confidence="high", anchor=None,
                     evidence="Missing guard", failure_scenario="Empty", minimal_fix="Guard", sources=[])
    good = {
        "context": dict(pr="https://github.com/a/b/pull/1", state="open", title="T", author="A",
            base_sha="a" * 40, head_sha="b" * 40, shortstat="", ci="Seen: pass", changed_files=["a"],
            linked_context="", test_signals="", behavior_summary="Guard", risk_areas=[], limitations=[],
            history="complete", dimensions=[dict(name="a", files=["a"], rationale="G")], base="M", head="H",
            threads=[dict(thread_id="T1", is_resolved=False, path="a.py", line=None, root_comment_id=123,
            root_url="https://a.co/r123", summary="Gap")], feedback=[], references=[]),
        "chunk": dict(dimension="tests", inspected=[dict(path="test.py", ranges="1-9")], gaps=[], findings=[],
                      residual_risks=[], references=[]),
        "author": dict(decision="REQUEST_CHANGES", summary="Fix guard.\n\nTests pass.", dropped=[],
                       residual_risks=[], references=[], findings=[
            dict(finding, id="a1", placement="inline", body="Fix:\n\n```suggestion\npass\n```\n",
            anchor=dict(path="app.py", line=4, start_line=2, side="RIGHT")),
            dict(finding, id="a2", placement="reply", root_comment_id=123, body="Still applies"),
            dict(finding, id="a3", placement="summary"), dict(finding, id="a4", placement="unknown")]),
        "verify": dict(issues=[], observed_checks=["Inspected guard"])}
    def payload(mode, data, status="PASS"):
        return (mode.upper() + ": " + status + "\n" + json.dumps(data)).encode()
    cases = [(mode + " good", mode, payload(mode, data), "") for mode, data in good.items()]
    cases.append(("FAIL", "verify", payload("verify", dict(issues=["Fix"], observed_checks=[]), "FAIL"), ""))
    cases += [(mode + status, mode, payload(mode, dict(reason="R", next_step="N"), status), "")
              for mode in MODES for status in FAILURES]
    mutations = [
        ("context", lambda d: d["threads"][0].update(is_resolved=True, line=2), ""),
        ("context", lambda d: d.pop("title"), "title: missing key"),
        ("context", lambda d: d.update(extra=1), "extra: extra key"),
        ("context", lambda d: d.update(state="draft"), "state: expected one of"),
        ("context", lambda d: d.update(base_sha="A" * 40), "base_sha: expected lowercase SHA"),
        ("context", lambda d: d.update(references=["http://example.com"]), "references[0]: expected HTTPS"),
        ("context", lambda d: d["dimensions"][0].update(files=["other.py"]), "not in changed_files"),
        ("context", lambda d: d.update(dimensions=[dict(name=f"d{i}", files=["a"], rationale="R")
                                                 for i in range(7)]), "dimensions: expected 1..6"),
        ("context", lambda d: d["dimensions"][0].update(name="Bad_name"), "expected dimension name"),
        ("context", lambda d: d.update(dimensions=d["dimensions"] * 2), "dimensions[1].name: duplicate"),
        ("context", lambda d: d.update(threads=[d["threads"][0]] * 2), "root_comment_id: duplicate"),
        ("chunk", lambda d: d.update(findings=[dict(finding, id="1")]), "id: expected dimension-N"),
        ("chunk", lambda d: d.update(inspected=[]), "inspected/gaps: must not both be empty"),
        ("author", lambda d: d["findings"][0]["anchor"].update(line=True), "anchor.line: expected integer"),
        ("author", lambda d: d["findings"][1].update(id="a1"), "findings[1].id: duplicate"),
        ("author", lambda d: d["findings"][0].update(anchor=None), "anchor: inline requires non-null"),
        ("author", lambda d: d["findings"][1].pop("root_comment_id"), "root_comment_id: missing"),
        ("author", lambda d: d["findings"][3].update(placement="reply", root_comment_id=123, body="R"),
         "root_comment_id: duplicate"),
        ("author", lambda d: d["findings"][2].update(body="extra"), "findings[2].body: extra key"),
        ("author", lambda d: d["findings"][0]["anchor"].update(start_line=4), "start_line: must be < line"),
        ("author", lambda d: d["findings"][0]["anchor"].update(start_line=5), "start_line: must be < line"),
        ("author", lambda d: d.update(findings=[]), "REQUEST_CHANGES requires at least one finding"),
        ("verify", lambda d: d.update(issues=["Problem"]), "issues: must be empty on PASS")]
    for mode, mutate, expected in mutations:
        data = copy.deepcopy(good[mode])
        mutate(data)
        cases.append((mode + expected, mode, payload(mode, data), expected))
    cases += [(expected, "verify", raw, expected) for raw, expected in [
        (b'WRONG: PASS\n{"issues":[],"observed_checks":[]}', "line 1: envelope"),
        (b'VERIFY: MAYBE\n{"issues":[],"observed_checks":[]}', "line 1: envelope"),
        (b'VERIFY: PASS\n{"issues":[],"issues":[],"observed_checks":[]}', "issues: duplicate key"),
        (b'VERIFY: FAIL\n{"issues":[],"observed_checks":[]}', "issues: must be empty on PASS"),
        (b'VERIFY: ERROR\n{"reason":"","next_step":"Ask"}', "reason: expected non-empty string"),
        (b'VERIFY: PASS\n{"issues":[],"observed_checks":[]} trailing', "line 2: $: Extra data"),
        (b'VERIFY: PASS\n\xff', "line 2: $: invalid UTF-8"),
        (b'VERIFY: PASS\n{"issues":NaN,"observed_checks":[]}', "invalid JSON constant NaN"),
        (b'VERIFY: PASS\n{"issues":Infinity,"observed_checks":[]}', "invalid JSON constant Infinity"),
        (b'VERIFY: PASS\n[]', "line 2: $: expected object")]]
    failed = [name for name, mode, raw, expected in cases
              if (not validate(mode, raw) if expected else bool(validate(mode, raw)))
              or (expected and not any(expected in error for error in validate(mode, raw)))]
    for arguments, raw, expected in [(["verify"], payload("verify", good["verify"]), 0),
                                     (["verify"], b"VERIFY: PASS\n{}", 1), ([], b"", 2)]:
        result = subprocess.run([sys.executable, "-I", __file__, *arguments], input=raw, capture_output=True)
        if result.returncode != expected:
            failed.append("CLI exit " + str(expected))
    total = len(cases) + 3
    print("\n".join(failed + [f"{total - len(failed)}/{total} passed"]))
    return int(bool(failed))

if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments == ["--self-test"]:
        sys.exit(self_test())
    if arguments == ["-h"] or len(arguments) != 1 or arguments[0] not in MODES:
        print(USAGE, file=sys.stdout if arguments == ["-h"] else sys.stderr)
        sys.exit(0 if arguments == ["-h"] else 2)
    errors = validate(arguments[0], sys.stdin.buffer.read())
    print("\n".join(errors), end="\n" if errors else "")
    sys.exit(int(bool(errors)))
