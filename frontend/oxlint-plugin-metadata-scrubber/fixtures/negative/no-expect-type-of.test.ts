import { expectTypeOf, test } from "vitest";

test("re-tests a static type", () => {
  expectTypeOf("value").toEqualTypeOf<string>();
});
