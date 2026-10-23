# imvu.js

TypeScript monorepo for the IMVU API (`packages/*`), with a VitePress + TypeDoc docs site
in `docs/` (its own npm package, using TypeScript 6 for TypeDoc). Plans and protocol
notes live in `ROADMAP.md` and `MODERNIZATION.md`.

## Keep the docs current

Every change to public behaviour or API ships with its docs in the same change:

- **Package README** (`packages/<name>/README.md`). It is also the package's page on the
  site, through `docs/packages/<name>/index.md`. Links in READMEs must be absolute
  site URLs (`https://dhkatz.github.io/imvu.js/...`); relative links break the build.
- **Guides and recipes** in `docs/guide` and `docs/recipes`. Fix any page whose claims
  the change makes wrong, not just the new feature's own page.
- **A new package** also needs: `docs/typedoc.json` `entryPoints`, a
  `docs/packages/<name>/index.md`, the `packages` list in `docs/.vitepress/config.mts`,
  and the package tables in `docs/index.md` and `docs/guide/getting-started.md`.
- **New pages** go in the sidebar in `docs/.vitepress/config.mts`.
- **Examples** (`examples/`) are included in pages with `<<<`. Keep them compiling.
- **A changeset** (`.changeset/`) for every package whose public surface changed.

`cd docs && npm run build` must finish without dead links or TypeDoc warnings (for
example, a public signature that references an unexported type).

## Checks before committing

```sh
npm run lint          # tsc -b + oxlint (type-aware)
npm run format        # oxfmt
npm test              # offline suite; live tests need IMVU_RUN_LIVE_TESTS=true
npm run test:typecheck
cd docs && npm run build
```

Live API tests and probes reuse the session cached in `cookies.json`. Never log in
repeatedly or in a loop; IMVU rate-limits logins.
