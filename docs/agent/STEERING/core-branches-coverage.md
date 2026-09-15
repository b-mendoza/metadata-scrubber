# Keep core branches with core tests

Scope: test classification and coverage in every service and language.

Why: a branch in core logic remains core behavior even when its input is unusual.

## Do's
### Classify tests by their effect on application behavior

Example core pipeline test cases:

```text
Scrub cache hit: reuse the revision-bound output without processing admission.
Scrub cache miss: acquire shared capacity before source download and processing.
Admission timeout: return overload without starting source work.
Source size overflow: reject the input before PDF processing.
```

Keep both sides of a core decision with the core behavior tests. Give each branch a test. A rare branch is not a reason to lower its coverage.

## Don'ts
### Do not relabel a core branch to avoid testing it

```text
Incorrect classification:
Put the scrub cache-hit branch in an optional edge-case suite.
Exclude admission rejection because successful processing already has a test.
```
