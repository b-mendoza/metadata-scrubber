import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { importXRules } from "./import-x-rules.ts";

const NO_DIAGNOSTICS = 0;
const INLINE_TYPE_DIAGNOSTICS = 5;

const createLinter = () =>
  new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      tseslint.configs.base,
      { files: ["**/*.ts"] },
      ...importXRules,
    ],
    ruleFilter: ({ ruleId }) =>
      ruleId === "import-x/consistent-type-specifier-style",
  });

describe("separate type imports", () => {
  const linter = createLinter();

  it.each([
    [
      "positive",
      'import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";\nimport ky, { HTTPError } from "ky";\nimport type { KyInstance as Client, RetryOptions as RetryPolicy } from "ky";\nimport type KyDefault from "ky";\nimport type * as KyTypes from "ky";\nimport { type } from "node:os";\nimport "ky";\n\nexport type { KyInstance, RetryOptions, ShouldRetryState, Client, RetryPolicy };\nexport type DefaultClientFactory = typeof KyDefault;\nexport type ClientModule = typeof KyTypes;\nexport { ky, HTTPError, type };\n',
      NO_DIAGNOSTICS,
    ],
    [
      "negative",
      'import ky, {\n  HTTPError,\n  type KyInstance,\n  type RetryOptions,\n  type ShouldRetryState,\n} from "ky";\nimport { HTTPError as RequestError, type KyInstance as Client } from "ky";\nimport {\n  type KyInstance as AllInlineClient,\n  type RetryOptions as AllInlineRetryOptions,\n} from "ky";\n\nexport type {\n  KyInstance,\n  RetryOptions,\n  ShouldRetryState,\n  Client,\n  AllInlineClient,\n  AllInlineRetryOptions,\n};\nexport { ky, HTTPError, RequestError };\n',
      INLINE_TYPE_DIAGNOSTICS,
    ],
  ])("preserves the %s fixture", async (_name, code, count) => {
    const [result] = await linter.lintText(code, { filePath: "policy.ts" });

    expect.assert(result != null);
    expect(result.messages).toHaveLength(count);
    expect(
      result.messages.every(
        ({ ruleId }) => ruleId === "import-x/consistent-type-specifier-style",
      ),
    ).toBe(true);
  });
});
