# `@tanstack/devtools-vite` production build

> **Factual reference.** This file records an observed tool issue. Update it when its evidence changes. The code is the source of truth. If this document and the code disagree, the code wins.

## Summary

**Resolved.** The project uses `@tanstack/devtools-vite@0.8.5`. Production builds strip devtools from `src/routes/__root.tsx` without breaking JSX.

## Current check

```bash
pnpm run build
```

## Revisit criteria

Recheck this reference when its evidence or dependencies change.
