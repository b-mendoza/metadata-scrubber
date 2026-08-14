# Code design

Principles that apply across services and languages. Framework-specific mechanisms (how a given service implements them) are documented in that service's own guides.

## Construction over validation

- **Construct, don't validate.** When only part of a value actually varies — the account identifier inside a fixed provider URL, the name inside a fixed path — hardcode the fixed parts and accept only the variable part as input. Assembling the value in code makes "points somewhere else" a state the configuration cannot even represent, so the validator that guarded against it, and its rejection-case tests, get deleted instead of maintained. Before writing validation for a structured value, ask first whether construction can remove the need for it.
- **For opaque external identifiers, validate presence, not plausibility.** A syntactic check on a bucket name or account identifier proves only that the string looks plausible; the owning system is the real oracle at first use, and no format rule catches a well-formed wrong value. Require such values to be present and non-blank, and reserve stronger checks for inputs that decide where trust flows, such as which host receives credentials — then try to remove even those by construction.

## Comments

- Comment to explain **why** — a constraint, a trade-off, a non-obvious invariant the code cannot express — never to narrate **what** the code does or that it changed. Comments describing the change itself ("removed X", "now uses Y instead") belong in the commit message, not the source.
