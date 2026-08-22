# Agent guide for `metadata-scrubber`

`metadata-scrubber` is a web app that removes metadata from uploaded files. The monorepo has a Go HTTP backend service in `backend/`. The monorepo has a TypeScript/React frontend service in `frontend/`. The frontend service uses TanStack Start and Vite. `pnpm` is the frontend package manager.

## Documentation model

Use two types of agent documentation. Keep this split when you add or edit documentation.

- Keep long-lived guidance in `AGENTS.md` files and `docs/agent/` directories. Include principles and general examples. Exclude source-code paths and code snippets so the guidance stays valid when the code changes.
- Keep short-lived references in Markdown files under a root or service `docs/` directory, outside `docs/agent/`. You can group related references in a subdirectory. Use these references for current architecture, file structure, conventions, and commands. Add a banner that requires an update when the code changes.

Add a guidance rule after an observed failure shows the need for it. Remove a rule when it no longer changes agent behavior. Every agent loads these files into its context. Keep each line tied to an agent action. State the required action instead of listing prohibited actions. Use a standalone prohibition when it addresses a repeated failure.

## Language

Use ASD-STE100 Simplified Technical English in every message to the user. Use it in every Markdown document that you add or edit. Write short sentences in active voice. Give one idea to each sentence. Choose the simplest word that keeps the meaning. Use the same word for the same thing. Keep technical names, identifiers, commands, and code in their exact form.

## Working with the user

Review the user's instructions before you act. Treat them as a starting point for the work. State when a premise is wrong. Propose a simpler approach when one exists. Explain errors in the problem statement and propose a better version. Give a concrete reason for each objection. The user expects reasoned review and welcomes reasoned objections. Help the user learn from the work. Follow an instruction when your review finds no objection.

## Code and test design

- Write separate and explicit application code for each use case. Do not replace use-case code with one general function for many use cases. Delete a helper that does nothing except remove duplication. Keep duplication at each call site.
- Make each custom lint rule message descriptive, actionable, and educational. Identify the problem and explain the required fix. Do not explain how to silence or bypass the rule.
- Fix the structure that causes each lint failure. Do not add lint-suppression comments or rule escape hatches. Keep a suppression only at a third-party API boundary that requires it.
- In tests, build request and response payloads from concrete typed contracts at each call site. Serialize each payload at that call site. Check each error. Use raw wire literals in dedicated wire-contract tests and nowhere else.

## Required workflow

- Read each service's `AGENTS.md` before you edit files in that service. That file defines the build, lint, and test commands for the service. It can override this file.
- Run the affected service's lint check after a substantive change. Run its test suite before you commit. Use the commands in the service's `AGENTS.md`. Passing checks do not prove that a change is correct. Escalate if you are unsure about correctness. Do not declare success while that doubt remains.
- Treat the linter configuration as the enforced style standard in each service. AI-review rules are in `.coderabbit.yaml` and the `.greptile/` directory. Read those files when a question about a standard occurs.
- Editing does not give permission to publish. Do not commit, push, open a pull request, or create an issue unless the user asks. If you commit, stage the paths that the task touched and no other paths.

## Subagents

Use subagents to keep intermediate file dumps out of the main thread. Keep each conclusion in the main thread. Delegate when a skill or task requires delegation. Delegate broad searches, audits across many files, self-contained investigations, and subtasks that can run at the same time. Give each subagent a bounded objective, a definition of done, scope constraints, and the required result format. Ask before you dispatch if you are unsure whether to delegate or which subagent to use.

## Open when relevant

Long-lived guidance:

- [Code design](docs/agent/code-design.md) covers construction over validation, comments, and request-scoped dependency injection.
- [Testing principles](docs/agent/testing.md) covers what to test and how to test it across services.
- [Workflow and task scoping](docs/agent/workflow.md) covers simplicity, scope control, issues, and task decomposition.
- [Verifying your work](docs/agent/verification.md) defines the evidence required in addition to passing tests.

Short-lived references describe the current state. Check them against the code.

- [Repository architecture](docs/architecture.md) describes the monorepo layout and links to each service's references.
