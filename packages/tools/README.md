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

Flags: `--variations`, `--rate <n>` (req/s, default 2), `--limit <n>`,
`--available-only`, `--yes` (proceed above 200 candidates), `--file <path>`.
Run `npm run tool -- names --help` for the full list.
