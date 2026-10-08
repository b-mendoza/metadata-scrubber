import { describe } from "node:test";

import { expect, test } from "vitest";

describe.skip("non-Vitest describe", () => {});

const it = {
  skip: (..._arguments: readonly unknown[]): undefined => undefined,
};
it.skip("local it", () => {});

const callLocalTest = (
  test: (name: string, callback: () => void) => void,
): void => {
  test("local test registration", () => {
    const prerequisite = false;
    if (!prerequisite) return;
  });
};
callLocalTest((_name, callback) => callback());

test("keeps nested helper returns local", () => {
  const prerequisite = false;
  function functionDeclaration(): void {
    if (!prerequisite) return;
  }

  functionDeclaration();
  expect(prerequisite).toBe(false);
});
