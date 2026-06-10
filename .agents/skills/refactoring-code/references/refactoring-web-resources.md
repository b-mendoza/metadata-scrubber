# Refactoring Web Resources

> Read this file only when the strategist or reviewer needs external conceptual guidance for a concrete decision. Fetch the smallest matching URL set; keep article text out of orchestrator handoffs.

This file is the skill's local reference router. Static refactoring guidance lives on the public web, not in the prompt. The strategist or reviewer consults the table only for concrete strategy/review decisions, fetches the smallest useful page set when public web access is allowed, and cites the URLs in its report.

## Fetch Policy

1. Start from project evidence: `BEHAVIOR_MAP`, code shape, tests, and user scope.
2. Resolve the reference status before strategy or review continues: not needed, bundled-local-only, fetched, declined-but-safe, or unavailable-but-safe.
3. Ask before public web fetching when required by the runtime, user policy, or current approval context.
4. Fetch at most two URLs for one strategy or review decision unless the user explicitly asks for deeper research.
5. Use fetched guidance to justify the minimal plan, never to broaden scope.
6. If a URL is declined or unavailable, continue only when local code evidence and bundled references are enough; record `declined-but-safe` or `unavailable-but-safe` accordingly. If the reference is required for a safe decision, stop with the smallest needed decision.

## Resource Index

| Decision | Fetch When | URL |
| -------- | ---------- | --- |
| What qualifies as a refactor | The plan risks changing observable behavior, or the user asks for the definition | https://martinfowler.com/bliki/DefinitionOfRefactoring.html |
| Naming a small mechanical move | A strategy step needs a named refactoring move | https://refactoring.com/catalog/ |
| Naming a code smell | The diagnosis needs vocabulary without inventing architecture | https://refactoring.guru/refactoring/smells |
| Safe edits to under-tested code | Behavior is under-tested and characterization tests may be relevant | https://michaelfeathers.silvrback.com/characterization-testing |
| Avoiding speculative structure (YAGNI) | A proposed layer or option only serves future flexibility | https://martinfowler.com/bliki/Yagni.html |
| Simple over easy | The trade-off is simpler data or control flow versus convenient abstraction | https://www.infoq.com/presentations/Simple-Made-Easy/ |
| Patience before sharing code (AHA / hasty DRY) | Duplication may be cheaper than the wrong shared abstraction | https://kentcdodds.com/blog/aha-programming |
| Wrong abstraction | A shared abstraction is harder to change than direct duplicated code | https://www.sandimetz.com/blog/2016/1/20/the-wrong-abstraction |
| Functional Core / Imperative Shell | Pure decisions and side effects are tangled in one module | https://www.destroyallsoftware.com/talks/boundaries |
| Domain-shaped folder names | Names and module boundaries should reflect business behavior | https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html |
| Ubiquitous language | A term means different things to engineering and the business | https://martinfowler.com/bliki/UbiquitousLanguage.html |
| Bounded context | One model means different things in different parts of the system | https://martinfowler.com/bliki/BoundedContext.html |
| Single-Responsibility framing | A module mixes responsibilities and a split is being considered | https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html |
| SOLID relevance | A current problem maps directly to responsibility, dependency, or substitution pressure | https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html |
| Cohesion and coupling | A split decision needs vocabulary for what stays together vs. apart | https://martinfowler.com/ieeeSoftware/coupling.pdf |

## Citation Format

In `STRATEGY` (or in `REFACTOR_REVIEW` when the reviewer fetches a URL), report fetched references as exact URLs:

```text
References fetched: https://martinfowler.com/bliki/Yagni.html, https://www.sandimetz.com/blog/2016/1/20/the-wrong-abstraction
```

When no web guidance is needed, report:

```text
References fetched: none
```

Also report the reference status:

```text
Reference status: not needed | bundled-local-only | fetched | declined-but-safe | unavailable-but-safe
```
