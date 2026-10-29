import {
  ok,
  Result,
  ResultAsync,
  ResultAsync as AsyncResult,
} from "neverthrow";
import * as results from "neverthrow";
import { strictEqual as localOk } from "node:assert";

const load = () => Promise.resolve("value");
const mapFailure = (cause: unknown) => new Error(String(cause));

const responseResult = await ResultAsync.fromPromise(load(), mapFailure);
if (responseResult.isErr()) {
  throw responseResult.error;
}
export const value = responseResult.value;
export const returnResult = () => ok("value");
export const mappedResult = ok("value").map((item) => item);
export const combinedResult = Result.combine([ok("value")]);
export const renamedResult = await AsyncResult.fromSafePromise(load());
export const namespacedResult = results.ok("value");

Result.fromThrowable(() => "value", mapFailure);
ResultAsync.fromThrowable(load, mapFailure);
ok("value").isErr();
ok("value").unwrapOr("fallback");
ok("value").match(
  (item) => item,
  () => "fallback",
);
await ResultAsync.fromSafePromise(load()).match(
  (item) => item,
  () => "fallback",
);
void ResultAsync.fromSafePromise(load()).then((result) => result.isErr());
localOk("value", "value");

export const shadowed = (
  ok: (item: string) => string,
  ResultAsync: { fromPromise: () => Promise<string> },
  AsyncResult: { fromSafePromise: () => Promise<string> },
  results: { ok: (item: string) => string },
) => {
  ok("local");
  void ResultAsync.fromPromise();
  void AsyncResult.fromSafePromise();
  results.ok("local");
};

// Returned user functions need type information, not a name guess.
export const userResult = () => ok("value");
userResult();
