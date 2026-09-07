# Question Manifest Builder Template

Read this file only when formatting the final manifest response. Return the structure below without extra prose.

## Successful Headers

Successful runs must start with exactly one of these headers:

```text
MANIFEST: PASS
Ticket: <KEY> | Mode: <upfront|critique> | Task: <N|->
Task title: <title or ->
Questions now: <N> | Deferred: <N> | Irrelevant: <N>
```

```text
MANIFEST: WARN
Ticket: <KEY> | Mode: <upfront|critique> | Task: <N|->
Task title: <title or ->
Questions now: <N> | Deferred: <N> | Irrelevant: <N>
```

Then return:

```text
## Manifest Summary

- Warning: <present only for WARN>
- Not surfaced: <N> lower-severity items retained in the critique artifact
  <present only when N > 0>

## Questions For Now

| # | Item ID | Category | Severity | Model | Skippable | Affects |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PF1 | Problem framing | HIGH | A | No | All |

`Model` is exactly `A` or `B`. `Skippable` is exactly `Yes` or `No`.
Derive both from the Model and Skippable Derivation table in
`./question-manifest-builder-rules.md`; the row above is an upfront hard
gate, which is the only combination that yields `A` and `No`.

### Brief 1 — PF1

- Original decision or question: <text>
- Critique summary: <text>
- Fallback/default: <text or none>

## Deferred Questions

| # | Item ID | Category | Severity | Deferred to |
| --- | --- | --- | --- | --- |
| 1 | DQ-3-1 | Task question | HIGH | Task 3 |

## Resolved Irrelevant

| # | Item ID | Reason |
| --- | --- | --- |
| 1 | DQ-3-2 | Already resolved by Task 2 decision log |
```

## Successful Example

```text
MANIFEST: PASS
Ticket: JNS-6065 | Mode: upfront | Task: -
Task title: -
Questions now: 1 | Deferred: 1 | Irrelevant: 0

## Manifest Summary

- Not surfaced: 2 lower-severity items retained in the critique artifact

## Questions For Now

| # | Item ID | Category | Severity | Model | Skippable | Affects |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PF1 | Problem framing | HIGH | A | No | All |

### Brief 1 — PF1

- Original decision or question: Who is the actual end user?
- Critique summary: The plan assumes admins and support engineers are the same persona.
- Fallback/default: none

## Deferred Questions

| # | Item ID | Category | Severity | Deferred to |
| --- | --- | --- | --- | --- |
| 1 | DQ-3-1 | Task question | HIGH | Task 3 |

## Resolved Irrelevant

| # | Item ID | Reason |
| --- | --- | --- |
```

## Blocked And Failed Headers

Blocked runs:

```text
MANIFEST: BLOCKED
Reason: <what is missing>
```

Failed runs:

```text
MANIFEST: FAIL
Reason: <what was malformed or unparseable>
```
