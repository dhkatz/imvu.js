# imvu.js Modernization Plan

_Written 2026-07-04._

## Current status (2026-07-07) — READ FIRST; supersedes older phase text below

The serialization approach evolved well past the original Valibot plan. Reality now:

- **Decorator-free _and_ validation-free.** After exploring decorators → Valibot, we
  landed on **discord.js-style `_patch(data)`** per resource: inline field assignment
  (+ renames, `in`-guards for partial IMQ updates), no runtime validation — trust the
  wire types, rely on tests for drift. `Resource.build` = `new` + `_patch`. Removed
  `typescript-json-serializer`, `reflect-metadata`, and Valibot; zero decorators
  monorepo-wide.
- **New `@imvu/rest` package** — the low-level layer (cookie jar + axios + auth + raw
  `resource()`/`resources()` + API wire types). `@imvu/client` composes it. Lets the
  upcoming 3D app fetch raw typed JSON without class overhead.
- **Vitest** (globals, no SWC), TypeScript 6, Prettier 3, Node 22.
- **Build: plain `tsc -b`, ESM-only** (NOT tsup — see below). `moduleResolution:
  NodeNext` + explicit `.js` extensions on relative imports (the real fix for the
  broken ESM); `composite` project references give dependency-aware builds
  (`tsc -b` on one package builds its deps first). No `ignoreDeprecations` — TS7-safe.
- **Packages (5):** `rest`, `client`, `imq`, `chkn`, `tools`.
- **Done:** Phases 0–4, build (Phase 3). **Remaining:** ESLint flat config (5),
  Changesets (6), CI (7).

**Build tool: we tried tsup, then reverted to `tsc`.** tsup fixed the broken ESM by
bundling, but its dts generator injects `baseUrl` (needs `ignoreDeprecations`, a TS7
risk) and it dropped project references (no dependency-aware builds). The broken ESM
was really just extensionless imports — fixed natively with NodeNext + `.js`
extensions, which also keeps `tsc -b`'s dependency-aware builds and is TS7-clean.
ESM-only for now (packages are `type: module`; add CJS later if a consumer needs it).

## Guiding decisions (original — Valibot/Standard-Schema parts are OBSOLETE, see above)

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

| Tool                  | From                     | To                                |
| --------------------- | ------------------------ | --------------------------------- |
| TypeScript            | 5.0.4                    | 6.0.x                             |
| Node (CI baseline)    | 16 (EOL)                 | 22 LTS (test matrix 20/22/24)     |
| Vitest                | (Jest 29)                | 4.x + `@vitest/coverage-v8`       |
| tsup                  | (raw tsc)                | 8.x                               |
| ESLint                | 8                        | 10.x (flat config)                |
| typescript-eslint     | `@typescript-eslint/*` 5 | `typescript-eslint` 8.x (unified) |
| Prettier              | 2.8                      | 3.x                               |
| Changesets            | (Lerna 6)                | `@changesets/cli` 2.x             |
| valibot               | —                        | 1.4.x                             |
| @standard-schema/spec | —                        | 1.x                               |
| rimraf                | 5                        | 6                                 |
| @types/node           | 20                       | 24 (match CI Node)                |
| axios                 | 1.1                      | 1.18                              |
| ws / @types/ws        | 8.8                      | 8.21                              |
| commander             | 9                        | 15                                |
| dotenv                | 16                       | 17                                |

Drop entirely: `typescript-json-serializer`, `reflect-metadata`, `lerna`,
`ts-jest`, `@types/jest`, `jest`, `ts-node` (unless still needed by a script),
`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
`eslint-plugin-prettier` (see Phase 5 note).

---

## Phase 0 — Establish a green baseline ✅ DONE 2026-07-04

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
serialization layer) would be done _without any test that can run in CI or offline_.
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
  2. **ts-jest emitted no `design:type` metadata.** ts-jest auto-discovers the _root_
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

## Phase 1 — Tooling floor: Node, TS 6, trivial bumps, Prettier 3 ✅ DONE

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
    silence TS 6's new deprecation _errors_ for `baseUrl`, `downlevelIteration`, and
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

**Prettier 2 → 3 (done, isolated commit):** bumped `prettier` ^3 and
`eslint-plugin-prettier` ^5 (keeps `npm run lint` working until the Phase 5 ESLint
migration; `eslint-config-prettier` ^8 already satisfies the v5 peer range). Kept
`trailingComma: "es5"` to minimize churn (revisit `"all"` later). Added a
`.prettierignore` (dist, coverage, lockfile, cookies.json, .env, docs, .claude) and
ran `prettier --write .` — 93 files reformatted, build green, tests unchanged.
NOTE: lint itself was not run this phase (deferred to Phase 5, which replaces the
whole ESLint setup); the `eslint-plugin-prettier` bump is precautionary.

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

## Phase 2 — Remove decorators → Valibot behind Standard Schema ✅ DONE (client)

The core change. Safe because **all deserialization funnels through one method**:
[`Utilities.deserialize`](packages/client/src/client/Utilities.ts#L51). You flip the
mechanism there once, then migrate resource files one at a time.

**Progress (2026-07-04):**

- Fixtures captured (offline safety net): `product`, `user`, `avatar` in
  `packages/client/test/fixtures/`. **PII scrubbed** from `user.json` (`email`,
  `unique_id`) — the `/user` response for the current user includes personal data.
**Architecture — schema-on-class + `build` factory (final, after iterating through
static-schema → serialization-layer+registry → this).** The registry was dropped
because a global mutable singleton defeats tree-shaking (all resources always
bundle), conflicts with `sideEffects: false`, and is fragile to import order /
deep-imports. Final shape:

- `serialization/parse.ts` — the only shared engine: `parseResource(schema, rename,
  payload) → { data, issues }` (resilient `safeParse` + per-field salvage), plus
  `toSnakeCase`, `resourceEntries` (`_id`), and a typed `Rename<S>`.
- Each resource file owns its schema: `export const ProductSchema = v.object({...})`
  (camelCase, source of truth) + `static schema` / `static rename` on the class.
  Fields stay declared with defaults and **mutable** (see IMQ note).
- `Resource.build(client, node)` — inherited, generic (`this: ResourceConstructor<T>`
  polymorphic `this`, `new this(client)`): validate → construct → assign → set
  relations/updates. Never throws.
- `Utilities.deserialize` just delegates to `cls.build(...)`. No registry, no side
  effects, tree-shakeable, `sideEffects: false` honest again.

**Design decisions (from review):**

- **Resilient runtime, but always-valid construction.** `parseResource` uses
  `safeParse` + salvage; `build` validates BEFORE constructing and every field has a
  default, so the instance is **always complete and valid** — a drifted field keeps
  its default and is logged (`console.warn`, "API drift?"), never thrown. Defaults are
  what guarantee "no unset/intermediate state." Rationale: IMVU drifts (we saw it); a
  published lib + high-volume app mustn't hard-fail a whole resource type on one
  changed field, nor silently swallow drift.
- **Mutable, not immutable — for IMQ.** IMVU's IMQ lets you subscribe to live resource
  updates; that's the live-mutable-object model (hold a resource, it updates in place;
  `readonly` fields would fight after-construction updates). A future
  `Resource.applyUpdate(partial)` is just another `parseResource` + assign on the same
  instance. Immutable-snapshot-via-events was the alternative, deferred as an IMQ API
  decision.
- **No `implements`; contract enforced by a generic test.** One test loops over every
  exported resource class and asserts (a) schema keys == class data fields (name-sync)
  and (b) each field default satisfies its schema entry (type-sync). Replaces the
  compile-time coupling; also guards "every resource has a schema."
- **Standard-Schema swappability dropped (consciously).** `parseResource` reads
  valibot's `schema.entries`, so we're Valibot-locked. Fine — validation isn't the
  bottleneck for a network-bound client.

**Fan-out complete (2026-07-04).** All 13 client resources migrated (inline
`XSchema` + `static schema`/`rename`, decorators stripped, fields mutable with
defaults); base `Resource` decorators removed and `build` added; `Utilities.deserialize`
delegates to `cls.build`; `typescript-json-serializer`, `reflect-metadata`, and the
`import 'reflect-metadata'` removed from the client; the 6 resources that weren't
publicly exported (`Album`, `Creator`, `Login`, `Outfit`, `Photo`,
`ProductSaleEvent`) are now exported from the resources barrel (return types of
public methods like `user.creator()`).
Verified: build green; offline **46/46** (fixtures for Product/User/Avatar + posture
+ contract for all 13); live 4-pass, no unexpected drift warnings, no regression.

**Decorators fully removed monorepo-wide (2026-07-06).** `tools`' only usage
(`SceneViewer` deserializing a client `Avatar` via `typescript-json-serializer`) was
already broken by the client migration (Avatar lost its decorators) — replaced with
direct field assignment on the synthetic scene avatar. Dropped
`typescript-json-serializer` from `tools`, and removed `emitDecoratorMetadata` /
`experimentalDecorators` from `tsconfig.base.json`. Repo-wide grep confirms zero
decorator/metadata references. **Phase 3 (tsup) is now unblocked.** The ts-jest
metadata scaffolding in `jest.config.ts` (`tsconfig.spec.json` + `isolatedModules:
false`) is now vestigial and gets deleted in Phase 4 (Vitest).

**Fixture coverage gap:** only Product/User/Avatar have captured fixtures. The other
10 schemas were converted from the old decorators (the mapping spec) and are guarded
by the contract test (names + default types) but NOT verified against real payloads.
Worth capturing fixtures for Room/Outfit/Creator/etc. opportunistically.

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
_population_ mechanism changes.

### 2c. Rewrite `deserialize` once

Replace the `JsonSerializer` call with: validate against `cls.schema` via the
Standard Schema interface, then `Object.assign(new cls(this), cls.map(parsed))`.
This is also where you _gain runtime validation the code never had_ — decide the
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

## Phase 3 — Build ✅ DONE (2026-07-07, revised 2026-07-17)

**Final: plain `tsc -b`, ESM-only** (we tried tsup first — see the status banner at
the top for why we reverted). Modernized `tsconfig.base.json` to `module`/
`moduleResolution: NodeNext`, `target: ES2022`, `composite: true` (project
references), dropped `baseUrl`/`downlevelIteration`/`ignoreDeprecations`. Ran a
codemod adding explicit `.js` extensions to all 124 relative imports (the actual fix
for the broken ESM). Each package `build: tsc -b`; root `build: tsc -b` walks the
reference graph. ESM-only `exports` (`{ types, default }`). Fixed two missing deps
(`imq`/`tools` now declare `@imvu/client`) and a NodeNext augmentation gap (declared
axios's `jar` ourselves in `rest`). **Verified: ESM loads in Node** (old
`ERR_MODULE_NOT_FOUND` gone), **dependency-aware builds work** (`tsc -b` on `client`
builds `rest` first), build/tests green.

### (original plan)

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

## Phase 4 — Tests: Jest → Vitest (no SWC) ✅ DONE (2026-07-06)

Removed `jest`/`ts-jest`/`@types/jest` + `jest.config.ts`; added `vitest` +
`@vitest/coverage-v8`; created root `vitest.config.ts` (`globals: true` so the
existing tests run unchanged — no `jest.*` APIs were used; `environment: 'node'`;
`setupFiles: ['dotenv/config']` for IMVU creds; `fileParallelism: false` = the
`--runInBand` equivalent honoring the cached-session rate-limit rule; v8 coverage;
`testTimeout: 30000`). `tsconfig.spec.json` now carries `types: ['vitest/globals',
'node']` for IDE support. Also removed the stale `"jest"` entry from every package
`tsconfig.json` `types` array (was breaking the build once `@types/jest` was gone)
and the now-vestigial ts-jest metadata scaffolding is gone with `jest.config.ts`.
**No SWC needed** — the decorator removal paid off exactly as intended.

Verified: build green; offline **46/46** under Vitest; live read-only subset 4-pass
(cached session, serial). Package `test` scripts → `vitest run`.

### (original plan)

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
4. **Prettier + ESLint:** modern guidance is to stop running Prettier _through_
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
