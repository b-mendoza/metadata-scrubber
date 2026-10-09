# Agent guide for `metadata-scrubber`

`metadata-scrubber` is a web app that removes metadata from uploaded files. The monorepo has a Go HTTP backend service in `backend/`. The monorepo has a TypeScript/React frontend service in `frontend/`. The frontend service uses TanStack Start and Vite. `pnpm` is the frontend package manager.

## Documentation model

Documents describe general practices only. Do not prescribe a specific use case, code pattern, or implementation.

Documents are never the source of truth. The code is the source of truth. If the code and a document disagree, the code wins.

Factual references, such as architecture, layout, and known issues, can describe the current code and tools. They do not define requirements. Check them against the code. Update them when they become wrong.

The project manifest defines available commands and scripts. Use `package.json` for the frontend, `Taskfile.yml` for the backend, and `terraform/Taskfile.yml` for Terraform. Do not keep a separate command inventory in a document.

Keep a guidance rule only when it states a useful general practice. Use observed failures to find general lessons. Remove case-specific fixes and duplicate guidance. Remove a rule when it no longer changes agent behavior. Every agent loads these files into its context. Keep each line tied to an agent action. State the required action instead of listing prohibited actions. Use a standalone prohibition when it addresses a repeated failure.

## Language

Use ASD-STE100 Simplified Technical English in every message to the user. Use it in every Markdown document that you add or edit. Write short sentences in active voice. Give one idea to each sentence. Choose the simplest word that keeps the meaning. Use the same word for the same thing. Keep technical names, identifiers, commands, and code in their exact form.

## Working with the user

Review the user's instructions before you act. Treat them as a starting point for the work. State when a premise is wrong. Propose a simpler approach when one exists. Explain errors in the problem statement and propose a better version. Give a concrete reason for each objection. The user expects reasoned review and welcomes reasoned objections. Help the user learn from the work. Follow an instruction when your review finds no objection.

## Code and test design

- Write separate and explicit application code for each use case. Do not replace use-case code with one general function for many use cases. Delete an application helper that does nothing except remove duplication. Keep duplication at each application call site. In a test file, you can keep one local setup helper that builds the code under test. Call the code under test explicitly in each test.
- Make each custom lint rule message descriptive, actionable, and educational. Identify the problem and explain the required fix. Do not explain how to silence or bypass the rule.
- Fix the cause of each failed check. If one place needs an exception, keep the exception as narrow as the tool allows and state the reason. Do not add a broad exception that covers a whole file or scope.
- In tests, build request and response payloads from concrete typed contracts at each call site. Serialize each payload at that call site. Check each error. Use raw wire literals in dedicated wire-contract tests and nowhere else.

## Required workflow

- Read each service's `AGENTS.md` before you edit files in that service. Use it for general practices. Find available commands in the service's project manifest. A guide does not override the code.
- Run the affected service's lint check after a substantive change. Run its test suite before you commit. Select commands from the project manifest. Passing checks do not prove that a change is correct. Escalate if you are unsure about correctness. Do not declare success while that doubt remains.
- Treat the linter configuration as the enforced style standard in each service.
- Editing does not give permission to publish. Do not commit, push, open a pull request, or create an issue unless the user asks. If you commit, stage the paths that the task touched and no other paths.

## Subagents

Use subagents to keep intermediate file dumps out of the main thread. Keep each conclusion in the main thread. Delegate when a skill or task requires delegation. Delegate broad searches, audits across many files, self-contained investigations, and subtasks that can run at the same time. Give each subagent a bounded objective, a definition of done, scope constraints, and the required result format. Ask before you dispatch if you are unsure whether to delegate or which subagent to use.

## Open when relevant

General guides:

- [Code design](docs/agent/code-design.md) covers general design practices.
- [Testing principles](docs/agent/testing.md) covers general test practices.
- [Workflow and task scoping](docs/agent/workflow.md) covers general practices for scope and task planning.
- [Verifying your work](docs/agent/verification.md) covers general practices for evidence and reporting.

Factual references describe the current code. Check their claims against the code. They do not define requirements.

- [Repository architecture](docs/architecture.md) describes the current monorepo layout and links to each service's factual references.
