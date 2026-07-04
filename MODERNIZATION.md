# imvu.js Modernization Plan

_Written 2026-07-04. Target end-state: TypeScript 6, Vitest (no SWC), tsup builds,
ESLint flat config v10, Prettier 3, Changesets for publishing, decorator-free
serialization via Valibot behind the Standard Schema interface._

## Guiding decisions (already made)

- **Drop decorators** (`typescript-json-serializer` + `reflect-metadata` +
  `emitDecoratorMetadata`) in favor of **Valibot** schemas, accessed through the
  **Standard Schema v1** interface so the validator is swappable later
  (ArkType/Zod drop-in for any hot path without touching call sites).
- Removing decorator metadata is the keystone: it unblocks **esbuild-based tooling**
  (tsup for builds, Vitest with no SWC plugin) everywhere.
- **tsup** for building (ESM + CJS + `.d.ts` per package).
- **Vitest** for tests (no SWC needed once decorators are gone).
- **Changesets** for versioning/publishing; **drop Lerna** (redundant with npm workspaces).

## Target versions (latest as of 2026-07-04)

| Tool | From | To |
|---|---|---|
| TypeScript | 5.0.4 | 6.0.x |
| Node (CI baseline) | 16 (EOL) | 22 LTS (test matrix 20/22/24) |
| Vitest | (Jest 29) | 4.x + `@vitest/coverage-v8` |
| tsup | (raw tsc) | 8.x |
| ESLint | 8 | 10.x (flat config) |
| typescript-eslint | `@typescript-eslint/*` 5 | `typescript-eslint` 8.x (unified) |
| Prettier | 2.8 | 3.x |
| Changesets | (Lerna 6) | `@changesets/cli` 2.x |
| valibot | — | 1.4.x |
| @standard-schema/spec | — | 1.x |
| rimraf | 5 | 6 |
| @types/node | 20 | 24 (match CI Node) |
| axios | 1.1 | 1.18 |
| ws / @types/ws | 8.8 | 8.21 |
| commander | 9 | 15 |
| dotenv | 16 | 17 |

Drop entirely: `typescript-json-serializer`, `reflect-metadata`, `lerna`,
`ts-jest`, `@types/jest`, `jest`, `ts-node` (unless still needed by a script),
`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
`eslint-plugin-prettier` (see Phase 5 note).

---

## Phase 0 — Establish a green baseline  ✅ DONE 2026-07-04

Goal: prove the repo builds and tests on current versions before changing anything,
so every later phase has a known-good reference.

**Results:**
- `npm ci` — OK (1123 pkgs; 60 audit vulns inherited from the old deps, expected to
  clear as versions are bumped in later phases).
- `npm run build` — **green.** Dual `tsc` build emits CJS + ESM + `.d.ts` for all
  four packages.
- **Bug found & fixed:** `managers/GiftsManager.ts` imported `BaseManager` from the
  package root barrel (`'../'` resolves to `src/index.ts`), creating a circular
  dependency (`index → Client → managers → AccountManager → GiftsManager → index`)
  that left `BaseManager === undefined` at class-extension time. `tsc` never caught
  it (type-check only); it only fails at runtime. Fixed to import
  `BaseManager` from `./BaseManager` and `Product/User` from `../resources`, matching
  every sibling manager. Typecheck re-verified clean.
- `npm test` — **all 6 suites require live IMVU credentials.** Every suite throws at
  module load if `IMVU_USERNAME`/`IMVU_PASSWORD` are unset. **There are zero offline
  unit tests.** See the elevated prerequisite below.

**⚠️ Critical finding — no offline test safety net.** The entire test suite is live
integration against the real IMVU API. That means Phase 2 (rewriting the
serialization layer) would be done *without any test that can run in CI or offline*.
Adding fixture-based deserialization tests is therefore promoted from a Phase 4
nicety to a **prerequisite for Phase 2** (see Phase 2a').

**Live-API smoke test (read-only, cached session, run 2026-07-04):**
- ✅ Credentials valid; `/login` POST returns `201 success`.
- ✅ Session caching works: `login()` skips the auth POST when `cookies.json` holds a
  matching `_imvu_avnm` (it equals the username). Runs after the first do **zero**
  auth POSTs. Tests should always run `--runInBand` to avoid a cold-start stampede.
- ✅ `GET /login/me` and `GET /user/user-<cid>` return `success`.
- ✅ **BUG #2 — decorator metadata never emitted (FIXED).** Symptom: `login()` ended
  with `GET /avatar/avatar-` (empty id) → HTTP 400, and every deserialized object came
  back empty. Initial hypothesis (API drift / `legacy_cid`) was **wrong** — the
  URL-based `_id` back-fill works fine. Real root cause, two parts:
  1. **`reflect-metadata` was never imported.** It's a dependency but no
     `import 'reflect-metadata'` existed anywhere, so `Reflect.getMetadata` had no
     store and the serializer read nothing at runtime. Fixed by importing it at the
     top of `packages/client/src/index.ts`.
  2. **ts-jest emitted no `design:type` metadata.** ts-jest auto-discovers the *root*
     `tsconfig.json`, which (unlike `tsconfig.base.json`) does not set
     `emitDecoratorMetadata`/`experimentalDecorators`, so the property-type metadata
     the serializer needs was never generated. Fixed by overriding those options (and
     `isolatedModules: false`) in the ts-jest transform in `jest.config.ts`.
  Verified: the built library (full `tsc`, with the polyfill) deserializes correctly
  (`id: 283489608`, `username: TroII`), and the read-only test subset went from
  **0 → 4 passing**. NOTE: both fixes become obsolete after Phase 2 — Valibot needs no
  runtime metadata and no compiler metadata emission, so this entire failure class
  disappears. That is the strongest possible argument for the decorator removal.
- ⚠️ **Follow-on bugs surfaced once deserialization worked (NOT yet fixed):**
  - `Fail to deserialize: type 'number' is not assignable to type 'date'` — date
    fields are typed `Date` but the API sends unix timestamps (numbers). Needs a
    date converter (or Valibot transform in Phase 2).
  - `/user/<id>/wishlist?limit=0 does not contain a single resource` — `count()` hits
    a collection endpoint but `Utilities.resource` expects a single object.
  These are real and belong to the Phase 2 serialization rework, not Bug #2.
- ❌ **BUG #3 — ESM build output is not loadable by Node.** Importing
  `packages/client/dist/esm/index.js` throws `ERR_UNSUPPORTED_DIR_IMPORT` on
  `./resources`: `tsc --module esnext` does not rewrite directory/extensionless
  imports (`from './resources'` → `'./resources/index.js'`). The published ESM entry
  is effectively broken for native-ESM consumers. **Fixed for free by the tsup
  migration (Phase 3)**, which bundles/rewrites specifiers.

These are exactly the failures the modernization is meant to prevent: BUG #2 would
have surfaced as a loud, located validation error under Valibot (Phase 2) instead of
a silent empty id, and is a prime motivator for the drift-detecting cron CI idea.

**Gate:** ✅ build green; auth + session caching verified against live API; Bug #2
(metadata) fixed and read-only subset 0→4 passing; Bug #3 (ESM build) and two
follow-on deserialization bugs documented for Phase 2/3.

---

## Phase 1 — Tooling floor: Node, TS 6, trivial bumps, Prettier 3  🚧 IN PROGRESS

**Done (2026-07-04), verified: build green on TS 6, read-only test subset unchanged
at 4 pass / 3 fail (no regression):**
- Node baseline: added `.nvmrc` (22) + root `engines: { node: ">=20" }`; `@types/node`
  → `^24`.
- Safe dep bumps: `rimraf` ^6, `type-fest` ^5, `dotenv` ^17, `axios` ^1.18,
  `ws`/`@types/ws` ^8.21/^8.18, `ts-jest` ^29.4 (TS6 peer support).
- **TypeScript 5 → 6.** Deviations from the original plan, all deliberate:
  - **Deferred the `moduleResolution: Node → Bundler` + `module → ESNext` change to
    Phase 3.** Doing it now would break the `tsc -b` CJS build (still in use until
    tsup). Instead added `"ignoreDeprecations": "6.0"` to `tsconfig.base.json` to
    silence TS 6's new deprecation *errors* for `baseUrl`, `downlevelIteration`, and
    `moduleResolution=node10` — all three get cleaned up properly in Phase 3.
  - Fixed two real generic-soundness errors TS 6 newly enforces (TS 5 let them slide):
    `URLPaginator` used type-fest's `Class<T>` (whose `prototype: Pick<T, keyof T>`
    shape defeats `T` inference → resolved to base `Resource`); switched it to
    `Constructor<T>`. And a `Writable<T>` vs `T` variance cast in `Utilities.resource`.
  - `ts-jest` now compiles via a dedicated `packages/client/tsconfig.spec.json`
    (extends the package config, widens `rootDir`/`include` to cover `test/`) so it
    uses the SAME options as the build — fixes `jar` augmentation + jest globals +
    metadata emission in one place.
- **Deferred multi-major deps on critical paths** (dedicated bumps later, with tests):
  `axios-cookiejar-support` 4→7 (core HTTP), `commander` 9→15 (tools CLI),
  `image-type` 5→6. Skipped `reflect-metadata` 0.1→0.2 (removed entirely in Phase 2).

**Remaining in Phase 1:** Prettier 2 → 3 as an isolated reformat commit (keep
`trailingComma: "es5"` for now to minimize churn; revisit `"all"` later). Also bump
`eslint-plugin-prettier` → ^5 alongside it so `npm run lint` isn't broken before the
Phase 5 ESLint migration.

### (original plan below)

## Phase 1 — Tooling floor: Node, TS 6, trivial bumps, Prettier 3

Low-risk, high-leverage. Do this before the decorator migration so the compiler
is modern when you rewrite resources.

1. **Node baseline**
   - Add `.nvmrc` → `22`.
   - Add `"engines": { "node": ">=20" }` to root `package.json`.
   - Bump `@types/node` to `^24`.
2. **Trivial dependency bumps** (per package): `axios` → `^1.18`, `ws`/`@types/ws`
   → `^8.21`, `commander` → `^15`, `dotenv` → `^17`, `rimraf` → `^6`,
   `type-fest` → latest.
3. **TypeScript 5 → 6**
   - Bump `typescript` → `^6`.
   - In `tsconfig.base.json`: change `"moduleResolution": "Node"` →
     `"Bundler"` (recommended with tsup) and `"module"` → `"ESNext"`.
     Keep `"target"` modern (`ES2022`+).
   - **Leave `emitDecoratorMetadata`/`experimentalDecorators` in place for now** —
     they're removed in Phase 2 once decorators are gone.
   - Re-check `useDefineForClassFields: true`: harmless once decorators are gone,
     but while decorators still exist it can clobber decorator-set fields. If
     Phase 2 lands first this is moot; if not, watch for undefined fields.
   - Fix any new TS 6 inference/strictness errors (usually few).
4. **Prettier 2 → 3**
   - Bump `prettier` → `^3`.
   - Note: v3 default `trailingComma` is `"all"`. Your `.prettierrc.json` pins
     `"es5"` — decide whether to adopt `"all"` (recommended) or keep `"es5"`.
   - Run `npx prettier -w .` once. This is a large, noisy, logic-free diff —
     commit it **alone** so real changes stay reviewable.

**Gate:** `npm run build` still green on TS 6; formatting committed separately.

---

## Phase 2 — Remove decorators → Valibot behind Standard Schema

The core change. Safe because **all deserialization funnels through one method**:
[`Utilities.deserialize`](packages/client/src/client/Utilities.ts#L51). You flip the
mechanism there once, then migrate resource files one at a time.

### 2a'. PREREQUISITE — capture offline deserialization fixtures
Phase 0 proved there is **no offline test coverage**. Before touching the
serialization layer, capture real API JSON payloads for the main resources
(`Product`, `User`, `Room`, `Outfit`, etc.) as fixtures and write Vitest/Jest tests
that assert `deserialize(cls, fixture)` produces the expected instance. This is the
regression net that makes the decorator→Valibot swap safe and gives CI something to
run without live credentials. Do this first.

### 2a. Add dependencies
- `packages/client`: add `valibot`, `@standard-schema/spec`.
- `packages/tools`: same (it uses `JsonSerializer` in `SceneViewer.ts`).

### 2b. Define the resource contract
Give each resource a wire-shape schema and a map-to-class function. Suggested shape:

```ts
// A resource class exposes:
//   static schema: StandardSchemaV1   // validates data.data (wire format)
//   static map(parsed): Partial<Instance>  // wire -> class fields
```

Keep the class itself (methods + injected `client`) exactly as-is; only the field
*population* mechanism changes.

### 2c. Rewrite `deserialize` once
Replace the `JsonSerializer` call with: validate against `cls.schema` via the
Standard Schema interface, then `Object.assign(new cls(this), cls.map(parsed))`.
This is also where you *gain runtime validation the code never had* — decide the
failure policy (throw vs. log-and-skip) to match current behavior (it currently
throws on `!resource`).

### 2d. Preserve the camelCase↔snake_case DX
The current serializer auto-maps camelCase fields to snake_case API keys via
`formatPropertyName`, with `@JsonProperty('creator_cid')` for exceptions. Reuse
that same regex as a **generic key transformer** so most schemas stay clean
camelCase and only true exceptions (`creator_cid`, `is`, `product_page`, etc.)
need explicit renames. Build one helper; apply everywhere.

### 2e. Migrate resources file-by-file
14 files, ~100 fields. Order easiest → hardest; suggest:
`Resource` (base) → `Product` → `User` → the rest. After each file:
- remove `@JsonObject`/`@JsonProperty` and the import,
- add the schema + map,
- run that resource's tests.

Files: `Resource, Album, Avatar, Chat, Creator, GetMatched, Login, Photo, Product,
Outfit, ProductSaleEvent, ProfileUser, User, Room` (client) and `SceneViewer` (tools).

### 2f. Purge decorator infrastructure
- Remove `typescript-json-serializer` and `reflect-metadata` from all packages.
- In `tsconfig.base.json` delete `emitDecoratorMetadata` and
  `experimentalDecorators`.
- Remove any `import 'reflect-metadata'` side-effect imports.

**Gate:** build green with no decorators; deserialize round-trips real fixture
payloads correctly (add fixtures if the live-API tests can't run offline).

---

## Phase 3 — Build: raw tsc → tsup

Now that esbuild can handle the code (no metadata), replace the fragile
dual-`tsc` scripts.

1. Add `tsup` as a root devDependency.
2. Per publishable package (`client`, `imq`; and `tools`/`chkn` if you build them),
   add `tsup.config.ts`:
   - `entry: ['src/index.ts']`, `format: ['esm','cjs']`, `dts: true`,
     `sourcemap: true`, `clean: true`, `target: 'node20'` (or `es2022`).
3. Replace each package's `build`/`build:cjs`/`build:esm`/`clean` scripts with
   `tsup` (+ `tsc --noEmit` for typecheck).
4. Update root `build` to fan out over workspaces (`npm run build -ws` or a
   `turbo`/`nx` runner if you want caching later — optional).
5. Verify each package's `exports` map still points at the emitted files
   (`dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` — adjust to tsup's output
   naming). Fix the `main`/`types`/`exports` fields accordingly.

**Gate:** `dist/` contains working ESM + CJS + types; a scratch
`import`/`require` of each entry resolves and runs.

---

## Phase 4 — Tests: Jest → Vitest (no SWC)

1. Remove `jest`, `ts-jest`, `@types/jest`, `jest.config.ts`.
2. Add `vitest`, `@vitest/coverage-v8`.
3. Add `vitest.config.ts` (or `vitest.workspace.ts` for the monorepo):
   - `test.coverage.provider = 'v8'`, `include` globs matching
     `packages/*/test/**/*.test.ts`.
   - `dotenv` loading: replicate the current `dotenv.config()` via a
     `setupFiles` entry.
   - **No SWC/esbuild decorator plugin needed** — decorators are gone.
4. Migrate test APIs: `jest.fn` → `vi.fn`, `jest.mock` → `vi.mock`,
   `jest.spyOn` → `vi.spyOn`; matchers are otherwise compatible. The current tests
   only import from `../../src`, so this is mechanical.
5. Update root/per-package `test` scripts to `vitest run --coverage`.
6. Consider adding offline fixture-based tests for deserialization so CI isn't
   dependent on live IMVU credentials.

**Gate:** `vitest run` passes offline for pure tests; live-API tests gated behind
env vars as before.

---

## Phase 5 — Lint: ESLint 8 → 10 flat config

Biggest breaking migration; isolated from runtime so do it after the code settles.

1. Remove `.eslintrc.json`, `@typescript-eslint/eslint-plugin`,
   `@typescript-eslint/parser`.
2. Add `eslint@^10`, `typescript-eslint@^8` (unified package),
   `eslint-config-prettier`.
3. Create `eslint.config.js` (flat):
   - spread `typescript-eslint`'s recommended configs,
   - port the one custom rule (`@typescript-eslint/no-explicit-any: off`),
   - port `import` resolver settings if you still want `eslint-plugin-import`
     (its flat-config support has caveats — evaluate whether TS + tsup already
     cover what you used it for).
4. **Prettier + ESLint:** modern guidance is to stop running Prettier *through*
   ESLint. Drop `eslint-plugin-prettier`; keep `eslint-config-prettier` to disable
   conflicting rules, and run `prettier` as its own script/CI check.
5. Update `lint` scripts (the current ones point at `packages/client/src/**/*`
   from every package — fix each to lint its own `src`).

**Gate:** `eslint .` clean; `prettier --check .` clean.

---

## Phase 6 — Publishing: drop Lerna → Changesets

1. Remove `lerna` and `lerna.json`.
2. Add `@changesets/cli`; run `npx changeset init` (creates `.changeset/`).
3. Configure `.changeset/config.json`: `access: "public"`, link to the two
   publishable packages (`@imvu/client`, `@imvu/imq`); keep `chkn`/`tools` private
   (they already are).
4. Workflow: `changeset` to record intent → `changeset version` to bump +
   changelog → `changeset publish` to release. Remove the old
   `postversion`/`prepublish` git-push hooks in each package (Changesets/CI owns this).

**Gate:** a dry-run `changeset version` produces sane bumps + changelogs.

---

## Phase 7 — CI refresh

Update `.github/workflows/build.yml`:
1. `actions/checkout@v4`, `actions/setup-node@v4`.
2. Node matrix `[20, 22, 24]` (drop 16); enable `cache: 'npm'`.
3. Steps: `npm ci` → `npm run build` → `eslint .` → `prettier --check .` →
   `vitest run --coverage`.
4. Keep the IMVU secrets for the live tests, but make the pure/unit tests run
   without them so PRs from forks aren't blocked.
5. Optional: add a `release.yml` using the Changesets GitHub Action to open a
   "Version Packages" PR and publish on merge.

**Gate:** CI green on the matrix; release workflow validated on a dry run.

---

## Suggested commit sequence

1. `chore: green baseline on current versions` (Phase 0, if any fixes)
2. `chore: node 22 baseline + trivial dep bumps`
3. `feat: typescript 6 + moduleResolution bundler`
4. `style: prettier 3 reformat` (isolated)
5. `refactor: replace decorators with valibot schemas` (may be several commits, one per few resources)
6. `chore: drop typescript-json-serializer + reflect-metadata`
7. `build: migrate to tsup`
8. `test: migrate jest -> vitest`
9. `chore: eslint 10 flat config`
10. `chore: lerna -> changesets`
11. `ci: node matrix + lint/format/test gates`

Each is independently shippable and reversible.

## Notes / watch-items

- **Runtime validation is new behavior.** The old serializer silently tolerated
  malformed payloads; Valibot will reject them. Decide throw-vs-tolerate per
  endpoint to avoid surprising consumers.
- **Standard Schema interface** in the hydrator is the hedge: if the future 3D app
  ever shows a validation hot path in a profile, swap those schemas to ArkType with
  no call-site changes. But validate at load boundaries, never per-frame.
- **Electron/Tauri CSP:** Valibot/Zod are eval-free and CSP-safe. Avoid
  `new Function`-based validators (TypeBox TypeCompiler, AJV) in a hardened
  renderer unless precompiled at build time.
- **`chkn` binary parsing** (Cal3D/LZMA) is unrelated to this migration and should
  not go through any JSON schema validator.
