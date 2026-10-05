# TypeScript design conventions

This file contains long-lived guidance for TypeScript design in the frontend. The short-lived [conventions reference](../conventions.md) records the current file names and structure.

## Mapped dependency failures

- Use result values for dependency failures only in server-only modules and frontend scripts. Browser code uses `async`/`await`, so the result library stays out of the client bundle.
- Keep the lint plugin free of the result library so that plugin consumers do not need it.
- Map each failure to a known error value at the operation. Keep the original failure in `cause`.
- Await only a result value in server-only modules and frontend scripts, except scripts that delete installed dependencies or dependency caches. Branch on success or failure.
- Use only runtime built-ins in scripts that delete installed dependencies or dependency caches so they can run without dependencies.
- Throw the mapped error at the route or tRPC boundary.
- Wrap a synchronous call that can throw so that it returns a mapped result.
- Map application-owned validation failures in server-only modules and scripts that use result values. Let a framework own validation only when it calls the schema and handles the failure.
- Review every result consumption. Lint checks do not cover every consumption form.

## Route data

- Await only critical data in a route loader. Critical data is data that the page cannot render without.
- Treat data as non-critical unless evidence shows that the page cannot render without it. Each query that a loader awaits delays the time to first byte, the first contentful paint, and every client navigation to the page.
- Start non-critical queries without waiting. Render their data under a Suspense boundary with a fallback.
- Read query data through Suspense by default. Ask the owner before you use a non-suspending query read. Keep query loading UI in the parent Suspense fallback instead of loading flags or nullable-data branches in the component. Keep mutation pending state in the component because mutations do not suspend.
- When the page becomes visible again, compare each time limit, such as a download-grant expiry, with the current clock. Browsers can stop timers in background tabs, so a timer alone can miss the limit.

## External input

Validate external input with Zod at each boundary.

## Client context

- Read the tRPC options proxy and the query client from context in components. Do not pass them as props.
- Pass the tRPC client and the query client as props only to the tRPC provider setup.
- Read the tRPC options proxy and the query client from the loader context in route loaders.

## HTTP requests

- Read the request-scoped Ky client from app bindings for backend calls.
- Pass the request signal.
- Use a relative path. The binding supplies the base URL.
- Extend the client for one use case only when that use case needs a different transport policy.
