# Agent Guide — metadata-scrubber

`metadata-scrubber` is a web app that strips metadata from uploaded files. It is a monorepo with a Go HTTP backend under `backend/` and a TypeScript/React (Vite) frontend under `frontend/`.

This root guide holds the conventions and working posture that apply everywhere. Build, lint, test, and architecture details that are specific to one service live in that service's own `AGENTS.md`.

## Repository layout

| Path | Contents |
| --- | --- |
| [`backend/`](./backend/) | Go HTTP service. Scrubbing logic, request handling, and config. Has its own `AGENTS.md`. |
| [`frontend/`](./frontend/) | TypeScript/React app built with Vite, managed with `pnpm`. Has its own `AGENTS.md`. |
| [`docs/`](./docs/) | Cross-cutting design notes and planning documents. |
| `docker-compose.yml` | Local orchestration of the backend and frontend together. |

## Working in a service

Before editing files under `backend/` or `frontend/`, read that service's `AGENTS.md` first. It is the source of truth for the tooling, commands, and conventions of that service, and it may override or extend anything here for its own tree. This root guide is the general baseline; the service guides are the specifics.

## Naming conventions

## The rule

Always use human-readable, logical variable, argument, and function names.

The goal is not code that merely works and passes tests. The goal is code that a future coding agent or human can read and understand: what a value holds, what a function does, and why a given decision was made.

## Why this matters

Names are the cheapest documentation you have. A well-named variable explains itself at every place it is used, so the reader never has to scroll back to the declaration or trace the data flow to figure out what it holds. A vague name like `out` or `src` forces that work onto every future reader, and the cost is paid again on every edit.

This is doubly true when the next reader is an LLM. Agents reason over the text of the code. A name that states its purpose gives the model reliable signal; a name like `b` gives it almost nothing and invites wrong guesses.

## How to name well

- **Name the thing, not its type or role in the abstract.** Prefer `filePropertyList` over `properties`, `inputBytes` over `src`, `outputBytes` over `out`. Ask yourself "`properties` of what? `out` of what?" and put the answer in the name.
- **Say what an error came from.** Prefer `removePropertiesErr` over a bare `err` when it aids clarity, so the reader knows which operation failed.
- **Spell out function arguments too.** An argument named `b` should be `bindings`. The parameter list is part of the function's documentation.
- **Avoid single letters and abbreviations** unless they are idiomatic (see below). Length is not the enemy; ambiguity is.

## Idiomatic names are fine, but be consistent

Some short names are idiomatic to the language or to our domain, and those are worth keeping:

- `ctx` for a `context.Context`
- `w http.ResponseWriter` and `r *http.Request` in HTTP handlers
- `ok` for the comma-ok boolean of a map lookup or type assertion
- `i`, `j` for loop indices over a plain range

Preserving these is encouraged. What we do not want is mixing conventions: do not write descriptive names in one function and cryptic single letters in the next for no reason. Pick the clear name unless a well-established idiom applies, and apply that choice consistently across the file and package.

## Good and bad names

The pattern to internalize: a bad name describes a value's shape or generic role, while a good name describes what the value actually holds in this context.

| Avoid | Prefer | Why |
| --- | --- | --- |
| `out` | `outputBytes` | "Out" of what, and holding what? Name the payload and, where useful, its type. |
| `src` | `inputBytes` | Says where the data comes from and what form it takes. |
| `properties` | `filePropertyList` | "Properties" of what? Anchor the noun to its subject. |
| `err` (bare, far from its cause) | `removePropertiesErr` | Names the operation that failed, so the reader does not have to trace it. |
| `b` (argument) | `bindings` | A single letter forces the reader to jump to the type to learn anything. |
| `data`, `val`, `tmp`, `res` | the specific noun it holds | Placeholder names carry no information and tend to outlive their scope. |

A quick test: read the name out loud and ask "of what?" or "for what?". If the name does not already answer the question, it is too vague.

Idiomatic exceptions still apply here. A bare `err` returned immediately on the next line is fine and conventional; the guidance above is about values that live long enough, or sit far enough from their origin, that the reader loses track of what they mean.
