# Examples

Runnable usage examples for the `@imvu/*` packages.

## Setup

1. Build the packages so the examples can import their compiled output:

   ```bash
   npm run build
   ```

2. Add credentials to `.env` at the repo root:

   ```
   IMVU_USERNAME=your-username
   IMVU_PASSWORD=your-password
   ```

   The first login caches a session in `cookies.json`; later runs reuse it and skip the login POST
   (so re-running examples won't hit login rate limits).

## Running

The examples are plain TypeScript, run with Node's built-in type stripping and `--env-file`:

```bash
node --env-file=.env examples/rest-basic.ts
node --env-file=.env examples/client-search.ts IMVU
node --env-file=.env examples/imq-listen.ts
```

- **Node 24+**: runs as shown.
- **Node 22**: add `--experimental-strip-types` (type stripping is still experimental there).

## What's here

| File               | Packages                   | Shows                                                               |
| ------------------ | -------------------------- | ------------------------------------------------------------------- |
| `rest-basic.ts`    | `@imvu/rest`               | Authenticate and read raw, un-modeled API JSON.                     |
| `client-search.ts` | `@imvu/client`             | The high-level modeled API (resource classes + managers).           |
| `imq-listen.ts`    | `@imvu/rest` + `@imvu/imq` | Authenticate, open a live IMQ connection, and subscribe to a queue. |
