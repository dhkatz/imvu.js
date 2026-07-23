# @imvu/tools

CLI utilities for the IMVU API (`imvu-tools`).

## Running

The commands need IMVU credentials — put them in `.env` at the repo root (see
[examples/README.md](../../examples/README.md)):

```
IMVU_USERNAME=your-username
IMVU_PASSWORD=your-password
```

**From source (no build step)** — run the TypeScript directly via `tsx`:

```bash
npm run tool -- names bob
```

`npm run tool` runs `packages/tools/src/index.ts` through `tsx`, so edits to the
tool's source take effect immediately. The `@imvu/*` packages it depends on are
resolved from their built output, so build them once first (`npm run build`); if
you're also changing those, keep `npx tsc -b --watch` running.

**From the built output:**

```bash
npm run build
node --env-file=.env packages/tools/dist/index.js names bob
```

## Commands

### `names` — username availability

```bash
npm run tool -- names bob                 # single name
npm run tool -- names bob alice carol     # several
npm run tool -- names "b@b"               # pattern: bab..bzb
npm run tool -- names "@@@"               # every 3-letter name
npm run tool -- names bill --variations   # bill + homoglyph look-alikes
cat names.txt | npm run tool -- names     # newline-separated from stdin
```

Pattern tokens: `*` any alphanumeric, `@` any letter, `#` any digit, `[..]` an
explicit set with ranges (`[a-f0-9]`). Prints `name - AVAILABLE` / `TAKEN`.

#### Saving output & resuming long runs

Results are written to **stdout**; progress and the summary go to **stderr** — so
you can redirect just the results (use `npm run -s` to suppress npm's own banner):

```bash
npm run -s tool -- names "@@@" --yes > results.txt   # results only; progress still on screen
```

For long runs, prefer `--out <file>`: it appends every result to the file, and on
re-run it **skips names already recorded** there — so an interrupted run resumes
where it left off. (Names that errored are re-checked; delete the file to start
fresh.)

```bash
npm run tool -- names "@@@" --out results.txt --yes   # run; Ctrl+C anytime
npm run tool -- names "@@@" --out results.txt --yes   # re-run — skips what's done
```

`--out` records every status (so resume is complete) even with `--available-only`,
which still filters what's printed to stdout.

Flags: `--variations`, `--rate <n>` (req/s, default 2), `--limit <n>`,
`--available-only`, `--yes` (proceed above 200 candidates), `--file <path>`,
`--out <path>`. Run `npm run tool -- names --help` for the full list.
