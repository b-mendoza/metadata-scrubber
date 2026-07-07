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

## Idiomatic names are fine, but be consistent

Some short names are idiomatic to the language or to our domain, and those are worth keeping:

- `ctx` for a `context.Context`
- `w http.ResponseWriter` and `r *http.Request` in HTTP handlers
- `ok` for the comma-ok boolean of a map lookup or type assertion
- `i`, `j` for loop indices over a plain range

Preserving these is encouraged. What we do not want is mixing conventions: do not write descriptive names in one function and cryptic single letters in the next for no reason. Pick the clear name unless a well-established idiom applies, and apply that choice consistently across the file and package.

## Examples from this codebase

### `backend/internal/scrub/scrub.go`

Before:

```go
func scrubPDF(src []byte) ([]byte, error) {
	var out bytes.Buffer
	var properties []string

	// An empty property list tells pdfcpu to remove all document properties.
	if err := api.RemoveProperties(bytes.NewReader(src), &out, properties, nil); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}
```

`src`, `out`, `properties`, and `err` all leave the reader asking "of what?" After:

```go
func scrubPDF(inputBytes []byte) ([]byte, error) {
	var outputBytes bytes.Buffer
	var filePropertyList []string

	// An empty property list tells pdfcpu to remove all document properties.
	if removePropertiesErr := api.RemoveProperties(
		bytes.NewReader(inputBytes), &outputBytes, filePropertyList, nil,
	); removePropertiesErr != nil {
		return nil, removePropertiesErr
	}

	return outputBytes.Bytes(), nil
}
```

### `backend/internal/bindings/bindings.go`

Before:

```go
// Inject returns middleware that attaches b to every request context.
func Inject(b Bindings) func(http.Handler) http.Handler {
```

`b` says nothing. After:

```go
// Inject returns middleware that attaches bindings to every request context.
func Inject(bindings Bindings) func(http.Handler) http.Handler {
```

Note that `ctx`, `w`, `r`, and `ok` elsewhere in the same file stay as they are: those are idiomatic and consistent, and renaming them would make the code less familiar to a Go reader, not more.
