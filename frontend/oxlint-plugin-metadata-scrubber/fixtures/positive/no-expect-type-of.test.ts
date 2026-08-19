import { strictEqual as expectTypeOf } from "node:assert";

import type { expectTypeOf as expectTypeOnly } from "vitest";
import {
  expect,
  type expectTypeOf as expectTypeOnlyFromSpecifier,
  test,
} from "vitest";

type ExpectTypeOnly = typeof expectTypeOnly;
type ExpectTypeOnlyFromSpecifier = typeof expectTypeOnlyFromSpecifier;

test("uses a runtime assertion", () => {
  const value = "value";
  expect(value).toBe("value");
});

test("allows a non-Vitest function with the same name", () => {
  expectTypeOf("value", "value");
});

test("allows a parameter with the same name", () => {
  const callLocalExpectation = (
    expectTypeOf: (value: unknown) => unknown,
  ): unknown => expectTypeOf("value");

  expect(callLocalExpectation((value) => value)).toBe("value");
});

export type { ExpectTypeOnly, ExpectTypeOnlyFromSpecifier };
