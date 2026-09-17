# Let the tool own generated and managed files

Scope: generated files and tooling-managed files, including route trees, schema output, `pnpm-lock.yaml`, and `go.sum`.

Why: a hand edit hides the real source and can disappear when the tool runs again.

## Do's
### Change the source or generator and let the owning tool produce the diff

Find the owning command in the affected service's authoritative manifest or task declaration. Regenerate the output after changing its source. Use the package manager or owning tool for lockfile changes.

```text
Current frontend examples, run from frontend/:
Route source change -> pnpm run build or pnpm run dev -> src/routeTree.gen.ts
Database schema change -> pnpm run db:generate -> Drizzle migration output
```

`db:generate` does not generate the route tree. Generated files can be tracked; do not ban their commits as a substitute for using the generator.

## Don'ts
### Do not hand-edit generated output or a lockfile

```text
I edited src/routeTree.gen.ts by hand instead of changing the route source and regenerating.
I changed the lockfile text instead of using its owning tool.
```
