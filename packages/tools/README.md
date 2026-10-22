# @imvu/tools

CLI utilities for the IMVU API (`imvu-tools`).

## Running

The commands need IMVU credentials — put them in `.env` at the repo root (see
[examples/README.md](https://github.com/dhkatz/imvu.js/blob/master/examples/README.md)):

```
IMVU_USERNAME=your-username
IMVU_PASSWORD=your-password
```

**From source (no build step)** — run the TypeScript directly via `tsx`. The
most reliable form (works in every shell) is to call it directly:

```bash
node --import tsx --env-file-if-exists=.env packages/tools/src/index.ts names bob
```

That runs `packages/tools/src/index.ts` through `tsx`, so edits to the tool's
source take effect immediately. The `@imvu/*` packages it depends on resolve
from their built output, so build them once first (`npm run build`); if you're
also changing those, keep `npx tsc -b --watch` running.

Since that command is long, add a shortcut to your shell profile:

```bash
# bash/zsh (~/.bashrc)
imvu-tools() { node --import tsx --env-file-if-exists=.env packages/tools/src/index.ts "$@"; }
```

```powershell
# PowerShell ($PROFILE)
function imvu-tools { node --import tsx --env-file-if-exists=.env packages/tools/src/index.ts @args }
```

Then just `imvu-tools names bob`. (The examples below use `imvu-tools` for that.)

> **PowerShell + `npm run`:** there's also an `npm run tool -- <args>` script, but
> **avoid it in PowerShell** — PowerShell strips the `--` separator before npm
> sees it, so flags like `--out` get mis-parsed. Use the shortcut above, the
> direct command, or (if you must) a double separator: `npm run -s tool -- -- …`.
> `npm run -s tool -- <args>` is fine in bash/CI.

**From the built output:**

```bash
npm run build
node --env-file=.env packages/tools/dist/index.js names bob
```

## Commands

### `names` — username availability

```bash
imvu-tools names bob                 # single name
imvu-tools names bob alice carol     # several
imvu-tools names "b@b"               # pattern: bab..bzb
imvu-tools names "@@@"               # every 3-letter name
imvu-tools names bill --variations   # bill + homoglyph look-alikes
cat names.txt | imvu-tools names     # newline-separated from stdin
```

Pattern tokens: `*` any alphanumeric, `@` any letter, `#` any digit, `[..]` an
explicit set with ranges (`[a-f0-9]`). Prints `name - AVAILABLE` / `TAKEN`.

#### Saving output & resuming long runs

Results go to **stdout**; progress and the summary go to **stderr** — so you can
redirect just the results:

```bash
imvu-tools names "@@@" --yes > results.txt   # results to file; progress still on screen
```

For long runs, prefer `--out <file>`: it appends every result to the file, and on
re-run it **skips names already recorded** there — so an interrupted run resumes
where it left off. (Names that errored are re-checked; delete the file to start
fresh.)

```bash
imvu-tools names "@@@" --out results.txt --yes   # run; Ctrl+C anytime
imvu-tools names "@@@" --out results.txt --yes   # re-run — skips what's done
```

`--out` records every status (so resume is complete) even with `--available-only`,
which still filters what's printed to stdout.

Flags: `--variations`, `--rate <n>` (req/s, default 2), `--limit <n>`,
`--available-only`, `--yes` (proceed above 200 candidates), `--file <path>`,
`--out <path>`. Run `imvu-tools names --help` for the full list.
