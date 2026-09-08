export function invariant(
  isSatisfied: boolean,
  message: string | (() => string),
): asserts isSatisfied {
  if (!isSatisfied) {
    throw new Error(typeof message === "function" ? message() : message);
  }
}
