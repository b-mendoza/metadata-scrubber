# Test the wiring of brittle constants

Scope: every constant whose change can alter cost, behavior, or a contract without an error.

Why: a wiring test can be the only check that detects use of the wrong model, prompt, limit, or pricing tier.

## Do's
### Import the production constant and check the behavior that uses it

In `frontend/src/shared/libs/ky/http-client.mod.server.test.ts`, the 502 test imports `HTTP_CLIENT_RETRY_LIMIT` from the production module. After the request settles, this assertion checks the real client's fetch count. `INITIAL_FETCH_ATTEMPT_COUNT` is the test's one initial attempt.

```ts
expect(fetchMock).toHaveBeenCalledTimes(
  HTTP_CLIENT_RETRY_LIMIT + INITIAL_FETCH_ATTEMPT_COUNT,
);
```

For a capacity check, compare the actual gate passed by server startup with `handler.ProcessingPermitCount`. Do not build a second gate in the test and call that a wiring check. Check the exact use of each brittle production constant instead of copying its value.

## Don'ts
### Do not replace a wiring check with a duplicate literal or a self-comparison

```ts
expect(fetchMock).toHaveBeenCalledTimes(2);
expect(HTTP_CLIENT_RETRY_LIMIT).toBe(HTTP_CLIENT_RETRY_LIMIT);
```

The literal can drift from production. The self-comparison cannot detect broken wiring. Import the expected constant and observe the independently exercised application behavior.
