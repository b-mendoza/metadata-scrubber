# `tsrs` TypeScript 7 checker limits

> **Factual reference.** This file records an observed tool issue. Update it when its evidence changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Summary

Open. The project uses two TypeScript checker versions. `lint:types` uses the TypeScript 7.1 nightly in `tsrs`. Cursor started the same checker through `TypeScriptTeam.native-preview`. ESLint type-aware rules use `typescript@6.0.3`.

`tsrs` is an experimental Rust port of the TypeScript 7 compiler and language server. Its published native packages do not cover Windows or Intel macOS.

## Evaluated versions

The evaluation used these versions.

| Package                         | Version                       | Result                                                       |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `tsrs`                          | `0.18.0-ts7.1.0-dev.20260929` | Installed and evaluated.                                     |
| `typescript`                    | `6.0.3`                       | Installed and evaluated.                                     |
| `typescript-eslint`             | `8.71.2`                      | Installed and evaluated.                                     |
| `eslint`                        | `10.12.0`                     | Installed and evaluated.                                     |
| `TypeScriptTeam.native-preview` | `0.20261020.1`                | Cursor on `darwin-arm64` started the `tsrs` language server. |
| Node.js                         | `24.22.0`                     | Used for local and container checks.                         |

`tsrs --version` reports:

```text
Version 7.1.0-dev.20260930.4 (tsrs 0.18.0-ts7.1.0-dev.20260929, microsoft/TypeScript@b85298b6a81f)
```

## Current setup

### Checker split

`frontend/package.json` sets `lint:types` to `tsrs --build --pretty`.

`frontend/eslint.config.ts` enables type-aware rules and `projectService`. The ESLint parser resolves `typescript@6.0.3`. The installed `typescript-eslint` package declares the TypeScript peer range `>=4.8.4 <6.1.0`.

The two checker versions can report different results for the same code. No such difference appeared on the current code. This evaluation does not prove that the checkers give the same results on other code.

### Editor

The workspace sets `"js/ts.experimental.useTsgo": true` and `"js/ts.tsdk.path": "./.vscode/tsrs"` in `.vscode/settings.json`. Each developer installs `TypeScriptTeam.native-preview` manually. The workspace does not recommend the extension.

The symlink `.vscode/tsrs/tsgo` points to `../../frontend/node_modules/tsrs/bin/tsrs`. The recorded extension source check found that version `1.0.1` searches for `tsc` or `tsgo` in that directory. It starts the executable with `--lsp --stdio`. The symlink supplies the expected executable name. The evaluation did not check the resolver in version `0.20261020.1`.

Cursor's built-in `typescript-language-features` extension starts tsserver unless both conditions hold:

- `js/ts.experimental.useTsgo` is `true`. Cursor accepts `typescript.experimental.useTsgo` as a fallback.
- The TypeScript Go extension is installed.

When both conditions hold, the built-in extension does not start tsserver. `TypeScriptTeam.native-preview` supplies the language features. Without that extension, the setting has no effect and tsserver runs.

The built-in version picker item `Use Workspace Version` sets `tsdk.path`. It expects a tsserver-based TypeScript. With `./.vscode/tsrs`, it shows this error:

```text
Could not load the TypeScript version at this path ./.vscode/tsrs
```

The correct picker item is `Use TypeScript Native Preview (Experimental)`. It runs `typescript.native-preview.enable`. That command writes `js/ts.experimental.useTsgo`.

Cursor on `darwin-arm64` started the `tsrs` language server through the configured path. The installed extension directory was `typescriptteam.native-preview-0.20261020.1-darwin-arm64`. The process list showed:

```text
frontend/node_modules/.pnpm/@tsrs+darwin-arm64@0.18.0-ts7.1.0-dev.20260929/node_modules/@tsrs/darwin-arm64/tsrs --lsp --stdio
```

The user reported no errors after the extension install. This evidence confirms server start. It does not confirm editor feature behavior.

This configuration depends on workspace trust and permission to use the workspace TypeScript path. The launcher requires `node` on the PATH that the editor gives the extension.

### Platform limit and fallback

The `optionalDependencies` in `frontend/node_modules/tsrs/package.json` list native packages only for `darwin-arm64`, `linux-x64-gnu`, `linux-x64-musl`, `linux-arm64-gnu`, and `linux-arm64-musl`.

This version has no Windows or `darwin-x64` native package. With the published packages, `lint:types` fails on those platforms and the editor language server cannot start. The package list and default launcher confirm this limit. The evaluation did not run on Windows or Intel macOS.

`typescript@6.0.3` remains installed. The fallback `pnpm exec tsc --build --pretty` checked the current project with exit code `0`. It uses the older checker version.

The fallback rewrites build-info files in `frontend/node_modules/.cache/`. A later `pnpm run lint:types` returned exit code `0` and restored the `tsrs` build-info files.

### Evaluation evidence

An earlier evaluation recorded these results:

- A frozen install passed. A clean `lint:types` run returned exit code `0`.
- Type-error probes in the app, node, and oxlint-plugin projects each returned exit code `2`. Each check reported its probe error.
- TypeScript 6 build-info files did not hide the probe errors.
- Full `pnpm run lint` returned exit code `0`.
- A `linux/amd64` container with `node:24.22.0` passed a fresh frozen install. Its clean check returned exit code `0`. Its probe check returned exit code `2`.
- A headless LSP test passed initialization, pull diagnostics, an in-memory `TS2322` probe, hover, and definition.
- The language server returned exit code `1` after `shutdown` and `exit`. The effect on the editor remains unverified.

Local checks for this update confirmed the package versions, the TypeScript peer range, and the compiler version output. They also confirmed the ESLint parser's TypeScript resolution and the fallback result above.

### Not verified

- VS Code itself. The evaluation covered only Cursor.
- Editor diagnostics, completions, refactor features, and parity with `lint:types`.
- Behavior on Windows or Intel macOS.
- The effect of exit code `1` after `shutdown` and `exit`.
- Watch mode.
- Equal checker results beyond the current code and recorded probes.
- GitHub Actions CI on real Linux hardware.

## Revisit criteria

Recheck this reference when one of these changes occurs:

- `tsrs` releases a stable version for TypeScript 7.1.
- `typescript-eslint` supports TypeScript 7.x.
- `tsrs` adds Windows or `darwin-x64` native packages.
