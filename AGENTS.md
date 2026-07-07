# Naming conventions

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
