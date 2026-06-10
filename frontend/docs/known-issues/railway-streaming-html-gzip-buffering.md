# Railway Gzip Buffering of Streamed HTML

## Summary

Railway deployments can appear to block React SSR streaming when HTML responses are gzip-compressed or buffered by an intermediary. The application may generate the shell and Suspense fallback promptly, but browsers can still receive the paintable HTML only after the slow Suspense query resolves.

## Affected Workflow

Production SSR pages deployed to Railway that rely on React streaming and Suspense boundaries for progressive rendering.

## Observed Symptom

The browser waits for slow `useSuspenseQuery` data before painting the route shell, even though the route prefetch is intentionally not awaited.

In this app, the `/` route should render `Hello, world!` and the Suspense fallback immediately, then stream the product list after `products.getProducts` resolves.

## Root Cause

React and TanStack Start can stream the shell correctly, but compression or proxy buffering can prevent the browser from receiving decompressed HTML chunks as they are produced.

Railway's streaming guidance calls out this failure mode: streamed data can arrive all at once when compression middleware or a proxy buffers the response.

## Local Mitigation

Set response headers on streamed document routes:

```http
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

`Cache-Control: no-transform` tells intermediaries not to transform the response, including compression that can buffer small streamed chunks.

`X-Accel-Buffering: no` tells compatible reverse proxies not to buffer the response before sending it downstream.

For the home route, this is configured in [`src/routes/index.tsx`](../../src/routes/index.tsx).

## References

- Railway streaming guide: [Stream AI Responses to a Frontend with Server-Sent Events](https://docs.railway.com/guides/streaming-ai-responses)
- Railway edge networking: [Edge Networking](https://docs.railway.com/networking/edge-networking)
- TanStack Router SSR guide: [SSR](https://tanstack.com/router/latest/docs/guide/ssr)
- React server streaming reference: [`renderToPipeableStream`](https://react.dev/reference/react-dom/server/renderToPipeableStream)

## Verification

Verify that browser-like requests receive the shell before the slow query completes:

```bash
curl -N --max-time 1 \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  'https://devoted-victory-production-6132.up.railway.app/'
```

The first chunk should contain the route shell and Suspense fallback.

Bot user agents should still wait for the completed SSR document because TanStack's streaming renderer uses the all-ready path for crawlers.

## Revisit Criteria

Revisit this mitigation if Railway changes its response compression/buffering behavior, or if TanStack Start exposes a deployment-specific streaming configuration that handles these headers centrally.
