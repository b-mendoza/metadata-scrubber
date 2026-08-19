import { describe } from "node:test";

import { expect, test } from "vitest";

describe.skip("non-Vitest describe", () => {});

const it = {
  skip: (..._arguments: readonly unknown[]): undefined => undefined,
};
it.skip("local it", () => {});

const callLocalSkip = (test: {
  readonly skip: (name: string, callback: () => void) => void;
}): void => {
  test.skip("local test", () => {});
};
callLocalSkip({ skip: () => {} });

const callLocalTest = (
  test: (name: string, callback: () => void) => void,
): void => {
  test("local test registration", () => {
    const prerequisite = false;
    if (!prerequisite) return;
  });
};
callLocalTest((_name, callback) => callback());

const localTest = {
  each:
    (_cases: readonly boolean[]) =>
    (_name: string, callback: () => void): void =>
      callback(),
};
localTest.each([false])("local parameterized test", () => {
  const ready = false;
  if (!ready) return;
});

test("fails a missing prerequisite", () => {
  const prerequisite = true;
  expect(prerequisite).toBe(true);
});

test("keeps nested helper returns local", () => {
  const prerequisite = false;
  const arrowHelper = (): void => {
    if (!prerequisite) return;
  };
  const functionExpression = function (): void {
    if (!prerequisite) return;
  };
  function functionDeclaration(): void {
    if (!prerequisite) return;
  }

  arrowHelper();
  functionExpression();
  functionDeclaration();
  expect(prerequisite).toBe(false);
});
