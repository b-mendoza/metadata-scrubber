# Use ASD-STE100 Simplified Technical English

Scope: every message to the user and every Markdown document that you add or edit.

Why: short active sentences hold one idea. The same word for the same thing removes ambiguity for the agent and the user.

## Do's
### Write one idea per sentence in active voice, and keep identifiers exact

```text
The handler reads the file. It then removes the metadata. It writes the result to storage.
```
Choose the simplest word that keeps the meaning. Keep technical names, commands, and code exact. The same rule applies to names. Use `storageKey` in prose when `storageKey` is the identifier.

## Don'ts
### Do not chain several ideas into one sentence or rename an identifier in prose

```text
The handler reads the file and then, after removing the metadata from it, writes the
result to storage, unless removal fails, in which case it returns an error.
```
This mixes four ideas and a branch. Split it.
