# Agent guide for `metadata-scrubber`

`metadata-scrubber` is a web app that removes metadata from uploaded files. The monorepo has a Go HTTP backend service in `backend/`. The monorepo has a TypeScript/React frontend service in `frontend/`. The frontend service uses TanStack Start and Vite. `pnpm` is the frontend package manager.

## Documentation model

Use general guides for general practices, not for specific use cases, code patterns, or implementations.

For factual references, the code is the source of truth. If the code and a factual reference disagree, follow the code.

Factual references, such as architecture, layout, and known issues, can describe the current code and tools. They do not define requirements. Check them against the code. Update them when they become wrong.

Use decided conventions to name the pattern the project chose when two or more patterns are valid. Give the reason for the choice. You can name the rejected alternative. Follow decided conventions in new and changed code. If code disagrees, report the mismatch and do not copy that code.

Keep each service's decided conventions in `<service>/docs/conventions.md`. Include no versions, file inventories, or commands. Verify that each named identifier exists in the code. Remove a convention when a lint rule enforces it or the project changes the choice.

The project manifest defines available commands and scripts. Use `package.json` for the frontend and `Taskfile.yml` for the backend. Do not keep a separate command inventory in a document.

Keep guidance only for useful general practices or decided conventions. Use observed failures to find general lessons or decided conventions. Remove case-specific fixes that state neither. Remove duplicate guidance. Remove a rule when it no longer changes agent behavior. Every agent loads these files into its context. Keep each line tied to an agent action. State the required action instead of listing prohibited actions. Use a standalone prohibition when it addresses a repeated failure.

## Language

Use ASD-STE100 Simplified Technical English in every message to the user. Use it in every Markdown document that you add or edit. Write short sentences in active voice. Give one idea to each sentence. Choose the simplest word that keeps the meaning. Use the same word for the same thing. Keep technical names, identifiers, commands, and code in their exact form.

## Working with the user

Review the user's instructions before you act. Treat them as a starting point for the work. State when a premise is wrong. Propose a simpler approach when one exists. Explain errors in the problem statement and propose a better version. Give a concrete reason for each objection. The user expects reasoned review and welcomes reasoned objections. Help the user learn from the work. Follow an instruction when your review finds no objection.

## Code and test design

- Write separate and explicit application code for each use case. Do not replace use-case code with one general function for many use cases. Delete an application helper that does nothing except remove duplication. Keep duplication at each application call site. In a test file, you can keep one local setup helper that builds the code under test. Call the code under test explicitly in each test.
- Make each custom lint rule message descriptive, actionable, and educational. Identify the problem and explain the required fix. Do not explain how to silence or bypass the rule.
- Fix the cause of each failed check. If one place needs an exception, keep the exception as narrow as the tool allows and state the reason. Do not add a broad exception that covers a whole file or scope.
- In tests, build request and response payloads from concrete typed contracts at each call site. Serialize each payload at that call site. Check each error. Use raw wire literals in dedicated wire-contract tests and nowhere else.

## Environment variables

- Define each environment variable only in its service schema: the [frontend schema](frontend/src/shared/config/env/environment.mod.server.ts) or the [backend schema](backend/internal/config/config.go). Make the schema reject each missing or invalid value. Do not keep an inventory in a guide.
- Read the raw environment only in the frontend app-bindings middleware and the backend `config.Load()`. Pass validated values to other code through `getAppBindings()`, parameters, or request bindings.
- Tests can set environment values to test the schema boundary.
- Trust the validated values. Do not add later checks, defaults, or fallbacks.
- Send a value to the browser only through server data, such as route loader data, and only when it is safe to expose. Do not await query data in a `loader`. The root loader may `await loadPostHogBrowserConfig()`. That value is not a TanStack Query.
- Vite build flags, such as `import.meta.env.DEV` and `import.meta.env.SSR`, are build constants, not environment variables. You can use them.

## Required workflow

- Read each service's `AGENTS.md` before you edit files in that service. Use it for general practices. Find available commands in the service's project manifest. For facts, a guide does not override the code.
- Run the affected service's lint check after a substantive change. Run its test suite before you commit. Select commands from the project manifest. Passing checks do not prove that a change is correct. Escalate if you are unsure about correctness. Do not declare success while that doubt remains.
- Treat the linter configuration as the enforced style standard in each service.
- Editing does not give permission to publish. Do not commit, push, open a pull request, or create an issue unless the user asks. If you commit, stage the paths that the task touched and no other paths.

## Subagents

Use subagents to keep intermediate file dumps out of the main thread. Keep each conclusion in the main thread. Delegate when a skill or task requires delegation. Delegate broad searches, audits across many files, self-contained investigations, and subtasks that can run at the same time. Give each subagent a bounded objective, a definition of done, scope constraints, and the required result format. Ask before you dispatch if you are unsure whether to delegate or which subagent to use.

In the T3 Code harness, `delegate_task` can run a child task in a different harness. Use `orchestrator_capabilities` to find the available providers and models. When a site blocks your harness, send the read to a harness that can reach it:

- Use the Codex harness (`codex`) for web pages that your harness cannot fetch, such as Reddit.
- Use the Grok harness (`grok`) with the `grok-4.6` model for posts on X (Twitter). Do not use `grok-4.7`, because it does not work as expected.

Set `reasoningEffort` in `target.options` for each child task in these harnesses. Choose `low`, `medium`, or `high` for what the task needs. Do not use a level above `high`.

Delegate after the first blocked fetch. Do not try other URLs, user agents, or scrapers to get past the block. Tell the child task to quote only the content that it retrieves.

## Open when relevant

Follow the decided conventions for the service you change: [frontend](frontend/docs/conventions.md) and [backend](backend/docs/conventions.md).

General guides:

- [Code design](docs/agent/code-design.md) covers general design practices.
- [Testing principles](docs/agent/testing.md) covers general test practices.
- [Workflow and task scoping](docs/agent/workflow.md) covers general practices for scope and task planning.
- [Verifying your work](docs/agent/verification.md) covers general practices for evidence and reporting.

Factual references describe the current code. Check their claims against the code. They do not define requirements.

- [Repository architecture](docs/architecture.md) describes the current monorepo layout and links to each service's factual references.
